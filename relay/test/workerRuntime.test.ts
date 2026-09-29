import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAppContext } from "../src/appContext.js";
import { openMemoryDatabase } from "../src/storage/database.js";
import { handleWorkerRequest } from "../src/worker/api.js";
import { shouldProxyToRelay } from "../src/worker/routing.js";
import {
  deviceAttachment,
  restoreSocket,
  sweepSockets,
  type HibernatingSocket,
  type SocketAttachment,
} from "../src/worker/sockets.js";
import { testConfig, TEST_DEVICE_ID } from "./helpers.js";

class FakeSocket implements HibernatingSocket {
  readyState = 1;
  attachment: SocketAttachment | null = null;
  readonly sent: string[] = [];
  closed: { code?: number; reason?: string } | null = null;

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    const closed: { code?: number; reason?: string } = {};
    if (code !== undefined) {
      closed.code = code;
    }
    if (reason !== undefined) {
      closed.reason = reason;
    }
    this.closed = closed;
    this.readyState = 3;
  }

  serializeAttachment(value: SocketAttachment): void {
    this.attachment = value;
  }

  deserializeAttachment(): SocketAttachment | null {
    return this.attachment;
  }
}

describe("worker runtime", () => {
  it("sends relay routes to the Durable Object and dashboard routes to Workers Assets", () => {
    assert.equal(shouldProxyToRelay("/health"), true);
    assert.equal(shouldProxyToRelay("/ready"), true);
    assert.equal(shouldProxyToRelay("/v1/devices/x/commands"), true);
    assert.equal(shouldProxyToRelay("/v1/ws/device"), true);
    assert.equal(shouldProxyToRelay("/v1/ws/pair"), true);
    assert.equal(shouldProxyToRelay("/admin/api/session"), true);
    assert.equal(shouldProxyToRelay("/s/device"), true);
    assert.equal(shouldProxyToRelay("/"), false);
    assert.equal(shouldProxyToRelay("/devices"), false);
    assert.equal(shouldProxyToRelay("/assets/app.js"), false);
  });

  it("returns JSON from the worker HTTP adapter", async () => {
    const db = openMemoryDatabase();
    const ctx = createAppContext(testConfig(), db);
    const response = await handleWorkerRequest(new Request("http://relay.test/health"), ctx);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(await response.json(), { status: "ok" });
    const missing = await handleWorkerRequest(new Request("http://relay.test/v1/missing"), ctx);
    assert.equal(missing.status, 404);
    db.close();
  });

  it("restores a hibernated device socket and ignores one that never authenticated", () => {
    const db = openMemoryDatabase();
    const ctx = createAppContext(testConfig(), db);
    const pending = new FakeSocket();
    pending.serializeAttachment(deviceAttachment("127.0.0.1"));
    restoreSocket(pending, ctx);
    assert.equal(ctx.connections.isOnline(TEST_DEVICE_ID), false);

    const authenticated = new FakeSocket();
    const attachment = {
      ...deviceAttachment("127.0.0.1"),
      deviceId: TEST_DEVICE_ID,
      authenticatedAt: Date.now(),
      lastHeartbeat: Date.now(),
    };
    authenticated.serializeAttachment(attachment);
    restoreSocket(authenticated, ctx);
    assert.equal(ctx.connections.get(TEST_DEVICE_ID)?.connectionId, attachment.connectionId);
    db.close();
  });

  it("closes unauthenticated and stale sockets when the alarm sweeps", () => {
    const db = openMemoryDatabase();
    const ctx = createAppContext(
      testConfig({ authTimeoutMs: 1_000, heartbeatStaleMs: 1_000 }),
      db,
    );
    const unauthenticated = new FakeSocket();
    unauthenticated.serializeAttachment({
      ...deviceAttachment("127.0.0.1"),
      openedAt: Date.now() - 5_000,
    });
    const stale = new FakeSocket();
    stale.serializeAttachment({
      ...deviceAttachment("127.0.0.1"),
      deviceId: TEST_DEVICE_ID,
      authenticatedAt: Date.now() - 5_000,
      lastHeartbeat: Date.now() - 5_000,
    });
    sweepSockets([unauthenticated, stale], ctx);
    assert.deepEqual(unauthenticated.closed, { code: 1008, reason: "auth_timeout" });
    assert.deepEqual(stale.closed, { code: 1001, reason: "heartbeat_stale" });
    db.close();
  });
});

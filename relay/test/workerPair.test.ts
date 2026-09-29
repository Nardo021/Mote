import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAppContext } from "../src/appContext.js";
import { openMemoryDatabase } from "../src/storage/database.js";
import {
  beginPairSocket,
  onPairMessage,
  sweepSockets,
  type HibernatingSocket,
  type SocketAttachment,
} from "../src/worker/sockets.js";
import { testConfig } from "./helpers.js";

const DEVICE_ID = "44444444-4444-4444-8444-444444444444";

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

describe("worker pairing authentication", () => {
  it("waits for pair_auth and does not trust the socket before that", () => {
    const db = openMemoryDatabase();
    const ctx = createAppContext(testConfig({ authTimeoutMs: 1_000 }), db);
    const created = ctx.pairing.createRequest(DEVICE_ID, "Office Mac", "127.0.0.1");
    const wrong = new FakeSocket();
    beginPairSocket(wrong);
    assert.equal(wrong.sent.length, 0);
    onPairMessage(
      wrong,
      ctx,
      JSON.stringify({
        type: "pair_auth",
        version: 1,
        request_id: created.id,
        pair_secret: "wrong",
      }),
    );
    assert.deepEqual(wrong.closed, { code: 1008, reason: "invalid_credentials" });
    assert.equal(wrong.sent.length, 0);

    const socket = new FakeSocket();
    beginPairSocket(socket);
    onPairMessage(
      socket,
      ctx,
      JSON.stringify({
        type: "pair_auth",
        version: 1,
        request_id: created.id,
        pair_secret: created.pairSecret,
      }),
    );
    assert.equal(socket.closed, null);
    assert.equal(JSON.parse(socket.sent[0] ?? "{}").type, "pair_pending");

    const stale = new FakeSocket();
    stale.serializeAttachment({ kind: "pair", openedAt: Date.now() - 5_000 });
    sweepSockets([stale], ctx);
    assert.deepEqual(stale.closed, { code: 1008, reason: "auth_timeout" });
    db.close();
  });
});

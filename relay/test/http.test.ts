import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Permission } from "../src/auth/permissions.js";
import { hashSecret } from "../src/auth/tokenHash.js";
import { ErrorCode } from "../src/utils/errors.js";
import { nowMs } from "../src/utils/time.js";
import { startTestServer, stopTestServer, TEST_DEVICE_ID, type TestServer } from "./helpers.js";

describe("HTTP API", () => {
  let server: TestServer;
  let token: string;
  let deviceId: string;

  before(async () => {
    server = await startTestServer({ rateLimitMax: 3, rateLimitWindowMs: 10_000 });
    const device = server.ctx.devices.createDevice("MacBook Pro", TEST_DEVICE_ID);
    deviceId = device.id;
    token = server.ctx.devices.createShortcutToken("Leo iPhone").token;
  });

  after(async () => {
    await stopTestServer(server);
  });

  it("serves unauthenticated health and readiness", async () => {
    const health = await server.app.inject({ method: "GET", url: "/health" });
    assert.equal(health.statusCode, 200);
    assert.deepEqual(health.json(), { status: "ok" });
    const ready = await server.app.inject({ method: "GET", url: "/ready" });
    assert.equal(ready.statusCode, 200);
    assert.deepEqual(ready.json(), { status: "ok" });
  });

  it("rejects command and status requests without a valid Shortcut token", async () => {
    const missing = await server.app.inject({
      method: "POST",
      url: `/v1/devices/${deviceId}/commands`,
      payload: { action: "lock" },
    });
    assert.equal(missing.statusCode, 401);
    assert.equal(missing.json().error.code, ErrorCode.UNAUTHORIZED);

    const invalid = await server.app.inject({
      method: "GET",
      url: `/v1/devices/${deviceId}/status`,
      headers: { authorization: "Bearer nope" },
    });
    assert.equal(invalid.statusCode, 401);
  });

  it("rejects a wrong credential role on the command HTTP path", async () => {
    server.ctx.tokenRepository.insert({
      id: "role-check",
      name: "device-shaped",
      tokenHash: hashSecret("ws-only"),
      permission: Permission.device_connection,
      enabled: true,
      createdAt: nowMs(),
      lastUsedAt: null,
    });
    const response = await server.app.inject({
      method: "POST",
      url: `/v1/devices/${deviceId}/commands`,
      headers: { authorization: "Bearer ws-only" },
      payload: { action: "lock" },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, ErrorCode.FORBIDDEN);
  });

  it("reports an offline device without queueing the command", async () => {
    const response = await server.app.inject({
      method: "POST",
      url: `/v1/devices/${deviceId}/commands`,
      headers: { authorization: `Bearer ${token}` },
      payload: { action: "lock" },
    });
    assert.equal(response.statusCode, 409);
    const body = response.json();
    assert.equal(body.status, "offline");
    assert.equal(body.device_id, deviceId);
    assert.equal(body.error.code, ErrorCode.DEVICE_OFFLINE);
    assert.equal(server.ctx.pending.size, 0);
  });

  it("reports device status without exposing secrets", async () => {
    const response = await server.app.inject({
      method: "GET",
      url: `/v1/devices/${deviceId}/status`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.device_id, deviceId);
    assert.equal(body.name, "MacBook Pro");
    assert.equal(body.online, false);
    assert.equal(body.last_seen_at, null);
    assert.equal(body.credential, undefined);
    assert.equal(body.credential_hash, undefined);
  });

  it("rejects unsupported actions", async () => {
    const response = await server.app.inject({
      method: "POST",
      url: `/v1/devices/${deviceId}/commands`,
      headers: { authorization: `Bearer ${token}` },
      payload: { action: "sleep" },
    });
    assert.equal(response.statusCode, 422);
    assert.equal(response.json().error.code, ErrorCode.UNSUPPORTED_ACTION);
  });

  it("rate limits repeated command submissions", async () => {
    const limited = await startTestServer({ rateLimitMax: 2, rateLimitWindowMs: 10_000 });
    const created = limited.ctx.devices.createDevice("Other Mac", "22222222-2222-4222-8222-222222222222");
    const shortcut = limited.ctx.devices.createShortcutToken("phone").token;
    const headers = { authorization: `Bearer ${shortcut}` };
    const payload = { action: "lock" };
    const first = await limited.app.inject({
      method: "POST",
      url: `/v1/devices/${created.id}/commands`,
      headers,
      payload,
    });
    const second = await limited.app.inject({
      method: "POST",
      url: `/v1/devices/${created.id}/commands`,
      headers,
      payload,
    });
    const third = await limited.app.inject({
      method: "POST",
      url: `/v1/devices/${created.id}/commands`,
      headers,
      payload,
    });
    assert.equal(first.statusCode, 409);
    assert.equal(second.statusCode, 409);
    assert.equal(third.statusCode, 429);
    assert.equal(third.json().error.code, ErrorCode.RATE_LIMITED);
    await stopTestServer(limited);
  });
});

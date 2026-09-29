import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { hashSecret } from "../src/auth/tokenHash.js";
import { Permission } from "../src/auth/permissions.js";
import { handleWorkerRequest } from "../src/worker/api.js";
import { ErrorCode } from "../src/utils/errors.js";
import { nowMs } from "../src/utils/time.js";
import { startTestServer, stopTestServer, TEST_DEVICE_ID, type TestServer } from "./helpers.js";

const DEVICE_B = "22222222-2222-4222-8222-222222222222";
const PASSWORD = "correct-horse-admin";
const ORIGIN = "http://127.0.0.1:8787";

describe("device-scoped shortcut tokens", () => {
  let server: TestServer;
  let cookie: string;

  before(async () => {
    server = await startTestServer();
    server.ctx.admins.create("admin", PASSWORD);
    server.ctx.devices.createDevice("Mac A", TEST_DEVICE_ID);
    server.ctx.devices.createDevice("Mac B", DEVICE_B);
    const login = await server.app.inject({
      method: "POST",
      url: "/admin/api/session",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      payload: { username: "admin", password: PASSWORD },
    });
    const raw = login.headers["set-cookie"];
    const value = Array.isArray(raw) ? raw[0] : raw;
    const match = /mote_admin_session=([^;]+)/.exec(String(value));
    assert.ok(match?.[1]);
    cookie = `mote_admin_session=${match[1]}`;
  });

  after(async () => {
    await stopTestServer(server);
  });

  it("allows the bound device and rejects every other device", async () => {
    const token = server.ctx.devices.createShortcutToken("phone-a", TEST_DEVICE_ID).token;
    const headers = { authorization: `Bearer ${token}` };
    const statusA = await server.app.inject({
      method: "GET",
      url: `/v1/devices/${TEST_DEVICE_ID}/status`,
      headers,
    });
    const commandA = await server.app.inject({
      method: "POST",
      url: `/v1/devices/${TEST_DEVICE_ID}/commands`,
      headers,
      payload: { action: "lock" },
    });
    const statusB = await server.app.inject({
      method: "GET",
      url: `/v1/devices/${DEVICE_B}/status`,
      headers,
    });
    const commandB = await server.app.inject({
      method: "POST",
      url: `/v1/devices/${DEVICE_B}/commands`,
      headers,
      payload: { action: "lock" },
    });
    const workerStatus = await handleWorkerRequest(
      new Request(`http://relay.local/v1/devices/${DEVICE_B}/status`, { headers }),
      server.ctx,
    );
    const workerCommand = await handleWorkerRequest(
      new Request(`http://relay.local/v1/devices/${DEVICE_B}/commands`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ action: "lock" }),
      }),
      server.ctx,
    );
    assert.equal(statusA.statusCode, 200);
    assert.equal(commandA.statusCode, 409);
    assert.equal(commandA.json().error.code, ErrorCode.DEVICE_OFFLINE);
    assert.equal(statusB.statusCode, 403);
    assert.equal(commandB.statusCode, 403);
    assert.equal(workerStatus.status, 403);
    assert.equal(workerCommand.status, 403);
    assert.equal(statusB.body.includes(token), false);
    assert.equal(commandB.body.includes("token_hash"), false);
  });

  it("keeps admin sessions independent of shortcut device scope", async () => {
    const adminCommand = await server.app.inject({
      method: "POST",
      url: `/admin/api/devices/${DEVICE_B}/commands`,
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        cookie,
      },
      payload: { action: "lock" },
    });
    assert.equal(adminCommand.statusCode, 409);
    assert.equal(adminCommand.json().error.code, ErrorCode.DEVICE_OFFLINE);
  });

  it("rejects a legacy unscoped token instead of treating it as global", async () => {
    server.ctx.tokenRepository.insert({
      id: "legacy-global",
      name: "legacy",
      tokenHash: hashSecret("legacy-global-secret"),
      permission: Permission.send_command,
      clientKind: "shortcut",
      deviceId: null,
      enabled: true,
      createdAt: nowMs(),
      lastUsedAt: null,
    });
    const response = await server.app.inject({
      method: "GET",
      url: `/v1/devices/${TEST_DEVICE_ID}/status`,
      headers: { authorization: "Bearer legacy-global-secret" },
    });
    assert.equal(response.statusCode, 403);
    const enabled = await server.app.inject({
      method: "POST",
      url: "/admin/api/tokens/legacy-global/enable",
      headers: { origin: ORIGIN, "content-type": "application/json", cookie },
      payload: {},
    });
    assert.equal(enabled.statusCode, 400);
  });

  it("requires one device when an admin creates a token", async () => {
    const missing = await server.app.inject({
      method: "POST",
      url: "/admin/api/tokens",
      headers: { origin: ORIGIN, "content-type": "application/json", cookie },
      payload: { name: "No device" },
    });
    assert.equal(missing.statusCode, 400);
    const listed = await server.app.inject({
      method: "POST",
      url: "/admin/api/tokens",
      headers: { origin: ORIGIN, "content-type": "application/json", cookie },
      payload: { name: "Many", device_ids: [TEST_DEVICE_ID, DEVICE_B] },
    });
    assert.equal(listed.statusCode, 400);
    const removedKind = await server.app.inject({
      method: "POST",
      url: "/admin/api/tokens",
      headers: { origin: ORIGIN, "content-type": "application/json", cookie },
      payload: { name: "Not a client", device_id: TEST_DEVICE_ID, client_kind: "ios" },
    });
    assert.equal(removedKind.statusCode, 400);
    const created = await server.app.inject({
      method: "POST",
      url: "/admin/api/tokens",
      headers: { origin: ORIGIN, "content-type": "application/json", cookie },
      payload: { name: "Scoped", device_id: TEST_DEVICE_ID, client_kind: "shortcut" },
    });
    assert.equal(created.statusCode, 200);
    assert.equal(created.json().device_id, TEST_DEVICE_ID);
    assert.equal(created.json().token_hash, undefined);
    assert.equal(typeof created.json().token, "string");
    const row = server.ctx.tokenRepository.findById(created.json().id as string);
    assert.equal(row?.deviceId, TEST_DEVICE_ID);
    assert.equal(JSON.stringify(row).includes(created.json().token as string), false);
  });
});

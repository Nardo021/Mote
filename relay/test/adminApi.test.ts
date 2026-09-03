import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ErrorCode } from "../src/utils/errors.js";
import { hashSecret } from "../src/auth/tokenHash.js";
import {
  authenticateDeviceSocket,
  nextMessage,
  startTestServer,
  stopTestServer,
  TEST_DEVICE_ID,
  waitForClose,
  type TestServer,
} from "./helpers.js";

const PASSWORD = "correct-horse-admin";
const ORIGIN = "http://127.0.0.1:3000";

function adminHeaders(cookie?: string, extra: Record<string, string> = {}) {
  return {
    origin: ORIGIN,
    "content-type": "application/json",
    ...(cookie ? { cookie } : {}),
    ...extra,
  };
}

function sessionCookie(response: {
  headers: { [key: string]: unknown };
}): string {
  const raw = response.headers["set-cookie"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  assert.ok(value);
  const match = /mote_admin_session=([^;]+)/.exec(value);
  assert.ok(match?.[1]);
  return `mote_admin_session=${match[1]}`;
}

async function login(server: TestServer): Promise<string> {
  const response = await server.app.inject({
    method: "POST",
    url: "/admin/api/session",
    headers: adminHeaders(),
    payload: { username: "admin", password: PASSWORD },
  });
  assert.equal(response.statusCode, 200);
  return sessionCookie(response);
}

describe("admin API", () => {
  let server: TestServer;
  let cookie: string;
  let deviceId: string;
  let credential: string;

  before(async () => {
    const dashboardDist = mkdtempSync(join(tmpdir(), "mote-dashboard-"));
    mkdirSync(join(dashboardDist, "assets"));
    writeFileSync(
      join(dashboardDist, "index.html"),
      "<!doctype html><title>Mote Relay</title><div id='root'></div>",
    );
    writeFileSync(join(dashboardDist, "assets", "app.js"), "window.__MOTE=1;");
    server = await startTestServer({ dashboardDist });
    server.ctx.admins.create("admin", PASSWORD);
    const device = server.ctx.devices.createDevice(
      "MacBook Pro",
      TEST_DEVICE_ID,
    );
    deviceId = device.id;
    credential = device.credential;
    cookie = await login(server);
  });

  after(async () => {
    await stopTestServer(server);
  });

  it("serves dashboard HTML at / and JSON 404 for API paths", async () => {
    const root = await server.app.inject({ method: "GET", url: "/" });
    assert.equal(root.statusCode, 200);
    assert.match(root.headers["content-type"] ?? "", /text\/html/);
    assert.match(root.body, /Mote Relay/);

    const devicesPage = await server.app.inject({
      method: "GET",
      url: "/devices",
    });
    assert.equal(devicesPage.statusCode, 200);
    assert.match(devicesPage.body, /Mote Relay/);

    const missingV1 = await server.app.inject({
      method: "GET",
      url: "/v1/nonexistent",
    });
    assert.equal(missingV1.statusCode, 404);
    assert.equal(missingV1.json().error.code, ErrorCode.INVALID_REQUEST);
    assert.equal(missingV1.body.includes("<!doctype html>"), false);

    const missingAdmin = await server.app.inject({
      method: "GET",
      url: "/admin/api/nonexistent",
    });
    assert.equal(missingAdmin.statusCode, 404);
    assert.equal(missingAdmin.json().error.code, ErrorCode.INVALID_REQUEST);

    const health = await server.app.inject({ method: "GET", url: "/health" });
    assert.deepEqual(health.json(), { status: "ok" });
    const ready = await server.app.inject({ method: "GET", url: "/ready" });
    assert.deepEqual(ready.json(), { status: "ok" });

    const asset = await server.app.inject({
      method: "GET",
      url: "/assets/app.js",
    });
    assert.equal(asset.statusCode, 200);
    assert.match(asset.headers["cache-control"] ?? "", /immutable/);
  });

  it("rejects unauthenticated admin routes and does not accept Shortcut tokens", async () => {
    const unauthenticated = await server.app.inject({
      method: "GET",
      url: "/admin/api/devices",
    });
    assert.equal(unauthenticated.statusCode, 401);

    const shortcut = server.ctx.devices.createShortcutToken("not-admin").token;
    const withBearer = await server.app.inject({
      method: "GET",
      url: "/admin/api/devices",
      headers: { authorization: `Bearer ${shortcut}` },
    });
    assert.equal(withBearer.statusCode, 401);

    const session = await server.app.inject({
      method: "GET",
      url: "/admin/api/session",
    });
    assert.equal(session.statusCode, 200);
    assert.equal(session.json().authenticated, false);
    assert.equal(session.json().configured, true);
  });

  it("sets an HttpOnly session cookie and never returns the session token", async () => {
    const response = await server.app.inject({
      method: "POST",
      url: "/admin/api/session",
      headers: adminHeaders(),
      payload: { username: "admin", password: PASSWORD },
    });
    const setCookie = String(response.headers["set-cookie"]);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /mote_admin_session=/);
    assert.equal(response.json().token, undefined);
    assert.equal(response.json().user.username, "admin");
    assert.equal(response.headers["cache-control"], "no-store");
  });

  it("lists devices without credentials and supports enable, disable, and rotation", async () => {
    const list = await server.app.inject({
      method: "GET",
      url: "/admin/api/devices",
      headers: adminHeaders(cookie),
    });
    assert.equal(list.statusCode, 200);
    const first = list.json().devices[0];
    assert.equal(first.name, "MacBook Pro");
    assert.equal(first.app_version, null);
    assert.equal(first.credential, undefined);
    assert.equal(first.credential_hash, undefined);

    const disabled = await server.app.inject({
      method: "POST",
      url: `/admin/api/devices/${deviceId}/disable`,
      headers: adminHeaders(cookie),
      payload: {},
    });
    assert.equal(disabled.statusCode, 200);
    assert.equal(disabled.json().enabled, false);

    const enabled = await server.app.inject({
      method: "POST",
      url: `/admin/api/devices/${deviceId}/enable`,
      headers: adminHeaders(cookie),
      payload: {},
    });
    assert.equal(enabled.json().enabled, true);

    const rotated = await server.app.inject({
      method: "POST",
      url: `/admin/api/devices/${deviceId}/credential/rotate`,
      headers: adminHeaders(cookie),
      payload: {},
    });
    assert.equal(rotated.statusCode, 200);
    assert.equal(typeof rotated.json().credential, "string");
    credential = rotated.json().credential as string;
    const row = server.ctx.deviceRepository.findById(deviceId);
    assert.ok(row);
    assert.equal(row.credentialHash, hashSecret(credential));
  });

  it("exposes the last reported app_version on admin devices", async () => {
    const mac = await authenticateDeviceSocket(
      server.wsUrl,
      deviceId,
      credential,
      "1.2.3 (4)",
    );
    const detail = await server.app.inject({
      method: "GET",
      url: `/admin/api/devices/${deviceId}`,
      headers: adminHeaders(cookie),
    });
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json().app_version, "1.2.3 (4)");
    mac.close();
    await waitForClose(mac);
  });

  it("creates and rotates shortcut tokens without exposing stored secrets", async () => {
    const created = await server.app.inject({
      method: "POST",
      url: "/admin/api/tokens",
      headers: adminHeaders(cookie),
      payload: { name: "iPhone Shortcut" },
    });
    assert.equal(created.statusCode, 200);
    const token = created.json().token as string;
    assert.match(token, /./);
    const tokenId = created.json().id as string;

    const listed = await server.app.inject({
      method: "GET",
      url: "/admin/api/tokens",
      headers: adminHeaders(cookie),
    });
    const row = listed
      .json()
      .tokens.find((item: { id: string }) => item.id === tokenId);
    assert.ok(row);
    assert.equal(row.token, undefined);
    assert.equal(row.token_hash, undefined);
    assert.equal(row.permission, "send_command");

    const stored = server.ctx.tokenRepository.findById(tokenId);
    assert.ok(stored);
    assert.equal(stored.tokenHash, hashSecret(token));
    assert.notEqual(stored.tokenHash, token);

    const rotated = await server.app.inject({
      method: "POST",
      url: `/admin/api/tokens/${tokenId}/rotate`,
      headers: adminHeaders(cookie),
      payload: {},
    });
    const replacement = rotated.json().token as string;
    assert.notEqual(replacement, token);
    assert.equal(
      server.ctx.tokenRepository.findByTokenHash(hashSecret(token)),
      undefined,
    );

    await server.app.inject({
      method: "POST",
      url: `/admin/api/tokens/${tokenId}/disable`,
      headers: adminHeaders(cookie),
      payload: {},
    });
    const forbidden = await server.app.inject({
      method: "POST",
      url: `/v1/devices/${deviceId}/commands`,
      headers: { authorization: `Bearer ${replacement}` },
      payload: { action: "lock" },
    });
    assert.equal(forbidden.statusCode, 401);

    await server.app.inject({
      method: "POST",
      url: `/admin/api/tokens/${tokenId}/enable`,
      headers: adminHeaders(cookie),
      payload: {},
    });
    const offline = await server.app.inject({
      method: "POST",
      url: `/v1/devices/${deviceId}/commands`,
      headers: { authorization: `Bearer ${replacement}` },
      payload: { action: "lock" },
    });
    assert.equal(offline.statusCode, 409);
  });

  it("routes a dashboard lock through CommandService and records activity", async () => {
    const mac = await authenticateDeviceSocket(
      server.wsUrl,
      deviceId,
      credential,
    );
    const commandPromise = nextMessage(mac);
    const request = server.app.inject({
      method: "POST",
      url: `/admin/api/devices/${deviceId}/commands`,
      headers: adminHeaders(cookie),
      payload: { action: "lock" },
    });
    const command = await commandPromise;
    assert.equal(command.type, "command");
    assert.equal(command.action, "lock");
    mac.send(
      JSON.stringify({
        type: "command_result",
        version: 1,
        command_id: command.id,
        status: "completed",
        completed_at: Date.now(),
      }),
    );
    const response = await request;
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, "completed");
    assert.equal(typeof response.json().duration_ms, "number");

    const activity = await server.app.inject({
      method: "GET",
      url: "/admin/api/activity?source=dashboard",
      headers: adminHeaders(cookie),
    });
    assert.equal(activity.json().events[0].source, "dashboard");
    assert.equal(activity.json().events[0].status, "completed");
    mac.close();
    await waitForClose(mac);
  });

  it("records shortcut activity separately and supports filters", async () => {
    const shortcut =
      server.ctx.devices.createShortcutToken("activity-shortcut").token;
    const mac = await authenticateDeviceSocket(
      server.wsUrl,
      deviceId,
      credential,
    );
    const commandPromise = nextMessage(mac);
    const request = server.app.inject({
      method: "POST",
      url: `/v1/devices/${deviceId}/commands`,
      headers: { authorization: `Bearer ${shortcut}` },
      payload: { action: "lock" },
    });
    const command = await commandPromise;
    mac.send(
      JSON.stringify({
        type: "command_result",
        version: 1,
        command_id: command.id,
        status: "completed",
        completed_at: Date.now(),
      }),
    );
    await request;

    const filtered = await server.app.inject({
      method: "GET",
      url: "/admin/api/activity?source=shortcut&limit=10",
      headers: adminHeaders(cookie),
    });
    assert.ok(
      filtered
        .json()
        .events.some(
          (event: { source: string }) => event.source === "shortcut",
        ),
    );
    const paged = await server.app.inject({
      method: "GET",
      url: "/admin/api/activity?limit=1&offset=0",
      headers: adminHeaders(cookie),
    });
    assert.equal(paged.json().events.length, 1);
    mac.close();
    await waitForClose(mac);
  });

  it("records timeout activity when the fake Mac does not answer", async () => {
    const mac = await authenticateDeviceSocket(
      server.wsUrl,
      deviceId,
      credential,
    );
    const response = await server.app.inject({
      method: "POST",
      url: `/admin/api/devices/${deviceId}/commands`,
      headers: adminHeaders(cookie),
      payload: { action: "lock" },
    });
    assert.equal(response.statusCode, 504);
    const activity = await server.app.inject({
      method: "GET",
      url: "/admin/api/activity?status=timeout&limit=5",
      headers: adminHeaders(cookie),
    });
    assert.ok(
      activity
        .json()
        .events.some((event: { status: string }) => event.status === "timeout"),
    );
    mac.close();
    await waitForClose(mac);
  });
});

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

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

function headers(cookie: string) {
  return {
    origin: "http://127.0.0.1:3000",
    "content-type": "application/json",
    cookie,
  };
}

describe("simulated dashboard and shortcut flow", () => {
  let server: TestServer;

  before(async () => {
    server = await startTestServer({ commandTimeoutMs: 400 });
    server.ctx.admins.create("admin", PASSWORD);
  });

  after(async () => {
    await stopTestServer(server);
  });

  it("locks from the Dashboard and from a Shortcut token against a fake Mac", async () => {
    const login = await server.app.inject({
      method: "POST",
      url: "/admin/api/session",
      headers: {
        origin: "http://127.0.0.1:3000",
        "content-type": "application/json",
      },
      payload: { username: "admin", password: PASSWORD },
    });
    assert.equal(login.statusCode, 200);
    const setCookie = String(login.headers["set-cookie"]);
    const match = /mote_admin_session=([^;]+)/.exec(setCookie);
    assert.ok(match?.[1]);
    const cookie = `mote_admin_session=${match[1]}`;

    const session = await server.app.inject({
      method: "GET",
      url: "/admin/api/session",
      headers: headers(cookie),
    });
    assert.equal(session.json().authenticated, true);

    const created = server.ctx.devices.createDevice(
      "MacBook Pro",
      TEST_DEVICE_ID,
    );
    const mac = await authenticateDeviceSocket(
      server.wsUrl,
      created.id,
      created.credential,
    );

    const online = await server.app.inject({
      method: "GET",
      url: `/admin/api/devices/${created.id}`,
      headers: headers(cookie),
    });
    assert.equal(online.json().online, true);

    const dashboardCommand = nextMessage(mac);
    const dashboardLock = server.app.inject({
      method: "POST",
      url: `/admin/api/devices/${created.id}/commands`,
      headers: headers(cookie),
      payload: { action: "lock" },
    });
    const first = await dashboardCommand;
    mac.send(
      JSON.stringify({
        type: "command_result",
        version: 1,
        command_id: first.id,
        status: "completed",
        completed_at: Date.now(),
      }),
    );
    const dashboardResult = await dashboardLock;
    assert.equal(dashboardResult.statusCode, 200);
    assert.equal(dashboardResult.json().status, "completed");

    const dashboardActivity = await server.app.inject({
      method: "GET",
      url: "/admin/api/activity?source=dashboard",
      headers: headers(cookie),
    });
    assert.equal(dashboardActivity.json().events[0].source, "dashboard");
    assert.equal(dashboardActivity.json().events[0].status, "completed");

    const tokenResponse = await server.app.inject({
      method: "POST",
      url: "/admin/api/tokens",
      headers: headers(cookie),
      payload: { name: "iPhone Shortcut" },
    });
    const shortcutToken = tokenResponse.json().token as string;

    const shortcutCommand = nextMessage(mac);
    const shortcutLock = server.app.inject({
      method: "POST",
      url: `/v1/devices/${created.id}/commands`,
      headers: { authorization: `Bearer ${shortcutToken}` },
      payload: { action: "lock" },
    });
    const second = await shortcutCommand;
    mac.send(
      JSON.stringify({
        type: "command_result",
        version: 1,
        command_id: second.id,
        status: "completed",
        completed_at: Date.now(),
      }),
    );
    const shortcutResult = await shortcutLock;
    assert.equal(shortcutResult.statusCode, 200);
    assert.equal(shortcutResult.json().status, "completed");

    const shortcutActivity = await server.app.inject({
      method: "GET",
      url: "/admin/api/activity?source=shortcut",
      headers: headers(cookie),
    });
    assert.equal(shortcutActivity.json().events[0].source, "shortcut");
    assert.equal(shortcutActivity.json().events[0].status, "completed");

    mac.close();
    await waitForClose(mac);
  });
});

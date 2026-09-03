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

describe("simulated end-to-end lock command", () => {
  let server: TestServer;
  let credential: string;
  let shortcutToken: string;

  before(async () => {
    server = await startTestServer({ commandTimeoutMs: 200 });
    const device = server.ctx.devices.createDevice("MacBook Pro", TEST_DEVICE_ID);
    credential = device.credential;
    shortcutToken = server.ctx.devices.createShortcutToken("Leo iPhone").token;
  });

  after(async () => {
    await stopTestServer(server);
  });

  it("routes a lock command to a simulated Mac and returns completed", async () => {
    const mac = await authenticateDeviceSocket(server.wsUrl, TEST_DEVICE_ID, credential);

    const commandPromise = nextMessage(mac);
    const request = server.app.inject({
      method: "POST",
      url: `/v1/devices/${TEST_DEVICE_ID}/commands`,
      headers: { authorization: `Bearer ${shortcutToken}` },
      payload: { action: "lock" },
    });

    const command = await commandPromise;
    assert.equal(command.type, "command");
    assert.equal(command.version, 1);
    assert.equal(command.device_id, TEST_DEVICE_ID);
    assert.equal(command.action, "lock");
    assert.equal(typeof command.id, "string");
    assert.equal(typeof command.nonce, "string");
    assert.ok(typeof command.created_at === "number" && command.created_at > 0);
    assert.ok(typeof command.expires_at === "number" && command.expires_at > command.created_at);

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
    const body = response.json();
    assert.equal(body.status, "completed");
    assert.equal(body.device_id, TEST_DEVICE_ID);
    assert.equal(body.device, "MacBook Pro");
    assert.equal(body.command_id, command.id);

    mac.close();
    await waitForClose(mac);
  });

  it("returns timeout when the simulated Mac does not acknowledge", async () => {
    const mac = await authenticateDeviceSocket(server.wsUrl, TEST_DEVICE_ID, credential);
    const commandPromise = nextMessage(mac);
    const response = await server.app.inject({
      method: "POST",
      url: `/v1/devices/${TEST_DEVICE_ID}/commands`,
      headers: { authorization: `Bearer ${shortcutToken}` },
      payload: { action: "lock" },
    });
    const command = await commandPromise;
    assert.equal(command.type, "command");
    assert.equal(response.statusCode, 504);
    assert.equal(response.json().status, "timeout");
    assert.equal(server.ctx.pending.size, 0);
    mac.close();
    await waitForClose(mac);
  });
});

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { handleWorkerRequest } from "../src/worker/api.js";
import { ErrorCode } from "../src/utils/errors.js";
import {
  authenticateDeviceSocket,
  nextMessage,
  openSocket,
  startTestServer,
  stopTestServer,
  TEST_DEVICE_ID,
  waitForClose,
  type TestServer,
} from "./helpers.js";

const OTHER_DEVICE_ID = "22222222-2222-4222-8222-222222222222";

describe("device capabilities and token scope", { concurrency: 1 }, () => {
  let server: TestServer;
  let credential: string;

  before(async () => {
    server = await startTestServer({ commandTimeoutMs: 200 });
    credential = server.ctx.devices.createDevice("MacBook Pro", TEST_DEVICE_ID).credential;
    server.ctx.devices.createDevice("Office PC", OTHER_DEVICE_ID);
  });

  after(async () => {
    await stopTestServer(server);
  });

  it("stores platform and actions from auth and keeps platform when a later auth omits it", async () => {
    const socket = await openSocket(server.wsUrl);
    socket.send(
      JSON.stringify({
        type: "auth",
        version: 1,
        device_id: TEST_DEVICE_ID,
        credential,
        platform: "windows",
        actions: ["lock"],
      }),
    );
    const result = await nextMessage(socket);
    assert.equal(result.status, "ok");
    assert.equal(server.ctx.connections.get(TEST_DEVICE_ID)?.platform, "windows");
    assert.deepEqual(server.ctx.devices.getDevice(TEST_DEVICE_ID)?.actions, ["lock"]);
    socket.close();
    await waitForClose(socket);

    const again = await authenticateDeviceSocket(server.wsUrl, TEST_DEVICE_ID, credential);
    assert.equal(server.ctx.connections.get(TEST_DEVICE_ID)?.platform, null);
    assert.deepEqual(server.ctx.connections.get(TEST_DEVICE_ID)?.actions, ["lock"]);
    assert.equal(server.ctx.devices.getDevice(TEST_DEVICE_ID)?.platform, "windows");
    again.close();
    await waitForClose(again);
  });

  it("rejects lock when the connected agent did not report it", async () => {
    const socket = await openSocket(server.wsUrl);
    socket.send(
      JSON.stringify({
        type: "auth",
        version: 1,
        device_id: TEST_DEVICE_ID,
        credential,
        platform: "macos",
        actions: [],
      }),
    );
    assert.equal((await nextMessage(socket)).status, "ok");
    const token = server.ctx.devices.createShortcutToken("phone", TEST_DEVICE_ID).token;
    const response = await server.app.inject({
      method: "POST",
      url: `/v1/devices/${TEST_DEVICE_ID}/commands`,
      headers: { authorization: `Bearer ${token}` },
      payload: { action: "lock" },
    });
    assert.equal(response.statusCode, 422);
    assert.equal(response.json().error.code, ErrorCode.UNSUPPORTED_ACTION);
    assert.equal(server.ctx.pending.size, 0);
    socket.close();
    await waitForClose(socket);
  });

  it("rejects an auth frame that reports an action outside Protocol v1", async () => {
    const socket = await openSocket(server.wsUrl);
    socket.send(
      JSON.stringify({
        type: "auth",
        version: 1,
        device_id: TEST_DEVICE_ID,
        credential,
        platform: "macos",
        actions: ["sleep", "mute", "unmute", "play_pause"],
      }),
    );
    const result = await nextMessage(socket);
    assert.equal(result.status, "error");
    assert.equal(result.error, "invalid_credentials");
    await waitForClose(socket);
    assert.equal(server.ctx.connections.isOnline(TEST_DEVICE_ID), false);
  });

  it("records shortcut activity and limits that token to one device", async () => {
    const mac = await openSocket(server.wsUrl);
    mac.send(
      JSON.stringify({
        type: "auth",
        version: 1,
        device_id: TEST_DEVICE_ID,
        credential,
        platform: "windows",
        actions: ["lock"],
      }),
    );
    assert.equal((await nextMessage(mac)).status, "ok");
    const scoped = server.ctx.devices.createCommandToken({
      name: "Lock Mac",
      clientKind: "shortcut",
      deviceId: TEST_DEVICE_ID,
    });
    const commandPromise = nextMessage(mac);
    const allowed = server.app.inject({
      method: "POST",
      url: `/v1/devices/${TEST_DEVICE_ID}/commands`,
      headers: { authorization: `Bearer ${scoped.token}` },
      payload: { action: "lock", source: "shortcut" },
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
    const response = await allowed;
    assert.equal(response.statusCode, 200);
    const events = server.ctx.activity.list({ deviceId: TEST_DEVICE_ID });
    assert.equal(
      events.find((event) => event.commandId === command.id)?.source,
      "shortcut",
    );

    const denied = await server.app.inject({
      method: "POST",
      url: `/v1/devices/${OTHER_DEVICE_ID}/commands`,
      headers: { authorization: `Bearer ${scoped.token}`, "content-type": "application/json" },
      payload: { action: "lock" },
    });
    const workerDenied = await handleWorkerRequest(
      new Request(`http://relay.local/v1/devices/${OTHER_DEVICE_ID}/commands`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${scoped.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ action: "lock" }),
      }),
      server.ctx,
    );
    assert.equal(denied.statusCode, 403);
    assert.equal(workerDenied.status, 403);
    const workerBody = (await workerDenied.json()) as { error: { code: string } };
    assert.equal(workerBody.error.code, ErrorCode.FORBIDDEN);

    const status = await server.app.inject({
      method: "GET",
      url: `/v1/devices/${TEST_DEVICE_ID}/status`,
      headers: { authorization: `Bearer ${scoped.token}` },
    });
    assert.equal(status.statusCode, 200);
    assert.equal(status.json().platform, "windows");
    assert.deepEqual(status.json().actions, ["lock"]);

    const hidden = await server.app.inject({
      method: "GET",
      url: `/v1/devices/${OTHER_DEVICE_ID}/status`,
      headers: { authorization: `Bearer ${scoped.token}` },
    });
    assert.equal(hidden.statusCode, 403);
    mac.close();
    await waitForClose(mac);
  });
});

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import {
  authenticateDeviceSocket,
  nextMessage,
  openSocket,
  startTestServer,
  stopTestServer,
  TEST_DEVICE_ID,
  waitForClose,
  waitUntil,
  type TestServer,
} from "./helpers.js";

describe("device WebSocket", () => {
  let server: TestServer;
  let credential: string;
  let shortcutToken: string;

  before(async () => {
    server = await startTestServer({ authTimeoutMs: 120, commandTimeoutMs: 150 });
    const device = server.ctx.devices.createDevice("MacBook Pro", TEST_DEVICE_ID);
    credential = device.credential;
    shortcutToken = server.ctx.devices.createShortcutToken("Leo iPhone").token;
  });

  after(async () => {
    await stopTestServer(server);
  });

  it("authenticates a valid Mac and registers the connection", async () => {
    const socket = await authenticateDeviceSocket(server.wsUrl, TEST_DEVICE_ID, credential);
    assert.equal(server.ctx.connections.isOnline(TEST_DEVICE_ID), true);
    const status = await server.app.inject({
      method: "GET",
      url: `/v1/devices/${TEST_DEVICE_ID}/status`,
      headers: { authorization: `Bearer ${shortcutToken}` },
    });
    assert.equal(status.json().online, true);
    socket.close();
    await waitForClose(socket);
    await waitUntil(() => !server.ctx.connections.isOnline(TEST_DEVICE_ID));
    assert.equal(server.ctx.connections.isOnline(TEST_DEVICE_ID), false);
  });

  it("rejects invalid Mac authentication and closes the socket", async () => {
    const socket = await openSocket(server.wsUrl);
    socket.send(
      JSON.stringify({
        type: "auth",
        version: 1,
        device_id: TEST_DEVICE_ID,
        credential: "wrong-secret",
      }),
    );
    const result = await nextMessage(socket);
    assert.equal(result.type, "auth_result");
    assert.equal(result.status, "error");
    assert.equal(result.error, "invalid_credentials");
    await waitForClose(socket);
    assert.equal(server.ctx.connections.isOnline(TEST_DEVICE_ID), false);
  });

  it("rejects a Shortcut token used as a device credential", async () => {
    const socket = await openSocket(server.wsUrl);
    socket.send(
      JSON.stringify({
        type: "auth",
        version: 1,
        device_id: TEST_DEVICE_ID,
        credential: shortcutToken,
      }),
    );
    const result = await nextMessage(socket);
    assert.equal(result.status, "error");
    await waitForClose(socket);
  });

  it("closes the socket if authentication never arrives", async () => {
    const socket = await openSocket(server.wsUrl);
    await waitForClose(socket, 500);
    assert.equal(server.ctx.connections.isOnline(TEST_DEVICE_ID), false);
  });

  it("closes a stale connection when the same device reconnects", async () => {
    const first = await authenticateDeviceSocket(server.wsUrl, TEST_DEVICE_ID, credential);
    const firstConnectionId = server.ctx.connections.get(TEST_DEVICE_ID)?.connectionId;
    const second = await authenticateDeviceSocket(server.wsUrl, TEST_DEVICE_ID, credential);
    await waitForClose(first, 500);
    assert.equal(server.ctx.connections.isOnline(TEST_DEVICE_ID), true);
    assert.notEqual(server.ctx.connections.get(TEST_DEVICE_ID)?.connectionId, firstConnectionId);
    second.close();
    await waitForClose(second);
  });

  it("responds to heartbeats without persisting every beat", async () => {
    const socket = await authenticateDeviceSocket(server.wsUrl, TEST_DEVICE_ID, credential);
    const before = server.ctx.devices.getDevice(TEST_DEVICE_ID)?.lastSeenAt;
    socket.send(
      JSON.stringify({
        type: "heartbeat",
        version: 1,
        device_id: TEST_DEVICE_ID,
        sent_at: 42,
      }),
    );
    const ack = await nextMessage(socket);
    assert.equal(ack.type, "heartbeat_ack");
    assert.equal(ack.sent_at, 42);
    assert.equal(typeof ack.server_at, "number");
    const after = server.ctx.devices.getDevice(TEST_DEVICE_ID)?.lastSeenAt;
    assert.equal(after, before);
    socket.close();
    await waitForClose(socket);
  });

  it("persists app_version from auth and keeps it when omitted on reconnect", async () => {
    const first = await authenticateDeviceSocket(
      server.wsUrl,
      TEST_DEVICE_ID,
      credential,
      "1.0.0 (1)",
    );
    assert.equal(server.ctx.devices.getDevice(TEST_DEVICE_ID)?.appVersion, "1.0.0 (1)");
    first.close();
    await waitForClose(first);

    const second = await authenticateDeviceSocket(server.wsUrl, TEST_DEVICE_ID, credential);
    assert.equal(server.ctx.devices.getDevice(TEST_DEVICE_ID)?.appVersion, "1.0.0 (1)");
    second.close();
    await waitForClose(second);
  });

  it("ignores malformed frames after authentication", async () => {
    const socket = await authenticateDeviceSocket(server.wsUrl, TEST_DEVICE_ID, credential);
    socket.send("not-json");
    socket.send(JSON.stringify({ type: "mystery", version: 1 }));
    assert.equal(server.ctx.connections.isOnline(TEST_DEVICE_ID), true);
    socket.close();
    await waitForClose(socket);
  });
});

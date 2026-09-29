import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { createAppContext } from "../src/appContext.js";
import { openMemoryDatabase } from "../src/storage/database.js";
import {
  onDeviceMessage,
  type HibernatingSocket,
  type SocketAttachment,
} from "../src/worker/sockets.js";
import {
  authenticateDeviceSocket,
  nextMessage,
  startTestServer,
  stopTestServer,
  testConfig,
  TEST_DEVICE_ID,
  type TestServer,
} from "./helpers.js";

const DEVICE_B = "22222222-2222-4222-8222-222222222222";

function commandResult(commandId: string, status: "completed" | "failed") {
  return JSON.stringify({
    type: "command_result",
    version: 1,
    command_id: commandId,
    status,
    completed_at: Date.now(),
  });
}

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

function attachDevice(socket: FakeSocket, deviceId: string, connectionId: string): void {
  socket.serializeAttachment({
    kind: "device",
    connectionId,
    remoteAddress: "127.0.0.1",
    openedAt: 1,
    deviceId,
    authenticatedAt: 1,
    lastHeartbeat: 1,
    platform: "macos",
    actions: ["lock"],
  });
}

describe("command result ownership", () => {
  let server: TestServer | undefined;

  after(async () => {
    if (server) {
      await stopTestServer(server);
    }
  });

  it("lets only the target device resolve a command on the worker websocket", async () => {
    server = await startTestServer({ commandTimeoutMs: 500 });
    const credentialA = server.ctx.devices.createDevice("Mac A", TEST_DEVICE_ID).credential;
    const credentialB = server.ctx.devices.createDevice("Mac B", DEVICE_B).credential;
    const token = server.ctx.devices.createShortcutToken("phone", TEST_DEVICE_ID).token;
    const macA = await authenticateDeviceSocket(server.wsUrl, TEST_DEVICE_ID, credentialA);
    const macB = await authenticateDeviceSocket(server.wsUrl, DEVICE_B, credentialB);
    const commandPromise = nextMessage(macA);
    const http = server.app.inject({
      method: "POST",
      url: `/v1/devices/${TEST_DEVICE_ID}/commands`,
      headers: { authorization: `Bearer ${token}` },
      payload: { action: "lock" },
    });
    const command = await commandPromise;
    const commandId = String(command.id);
    macB.send(commandResult(commandId, "failed"));
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(server.ctx.pending.size, 1);
    macA.send(commandResult(commandId, "completed"));
    const response = await http;
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, "completed");
    macA.close();
    macB.close();
  });

  it("enforces the same ownership when the worker socket adapter delivers the result", async () => {
    const db = openMemoryDatabase();
    const ctx = createAppContext(testConfig(), db);
    const warnings: string[] = [];
    ctx.securityLog = {
      info() {
        return undefined;
      },
      warn(_obj, msg) {
        warnings.push(msg);
      },
    };
    ctx.devices.createDevice("Mac A", TEST_DEVICE_ID);
    ctx.devices.createDevice("Mac B", DEVICE_B);
    const socketA = new FakeSocket();
    const socketB = new FakeSocket();
    attachDevice(socketA, TEST_DEVICE_ID, "conn-a");
    attachDevice(socketB, DEVICE_B, "conn-b");
    ctx.connections.register({
      deviceId: TEST_DEVICE_ID,
      connectionId: "conn-a",
      socket: socketA,
      authenticatedAt: 1,
      lastHeartbeat: 1,
      lastSeen: 1,
      platform: "macos",
      actions: ["lock"],
    });
    ctx.connections.register({
      deviceId: DEVICE_B,
      connectionId: "conn-b",
      socket: socketB,
      authenticatedAt: 1,
      lastHeartbeat: 1,
      lastSeen: 1,
      platform: "macos",
      actions: ["lock"],
    });
    const waiter = ctx.pending.wait("cmd_worker", TEST_DEVICE_ID, 1_000, 1, 2);
    onDeviceMessage(socketB, ctx, commandResult("cmd_worker", "failed"));
    assert.equal(ctx.pending.size, 1);
    assert.deepEqual(warnings, ["command result rejected for device mismatch"]);
    onDeviceMessage(socketB, ctx, commandResult("missing", "completed"));
    assert.equal(ctx.pending.size, 1);
    onDeviceMessage(socketA, ctx, commandResult("cmd_worker", "completed"));
    assert.equal((await waiter).status, "completed");
    db.close();
  });
});

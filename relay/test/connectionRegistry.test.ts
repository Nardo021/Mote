import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ConnectionRegistry, type RelaySocket } from "../src/websocket/connectionRegistry.js";

class FakeSocket implements RelaySocket {
  readyState = 1;
  closedReason: string | undefined;
  sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }

  close(_code?: number, reason?: string): void {
    this.readyState = 3;
    this.closedReason = reason;
  }
}

describe("connection registry", () => {
  it("registers a device connection as online", () => {
    const registry = new ConnectionRegistry();
    const socket = new FakeSocket();
    registry.register({
      deviceId: "dev-1",
      connectionId: "c1",
      socket,
      authenticatedAt: 1,
      lastHeartbeat: 1,
      lastSeen: 1,
    });
    assert.equal(registry.isOnline("dev-1"), true);
    assert.equal(registry.get("dev-1")?.connectionId, "c1");
  });

  it("lets a new authenticated connection supersede the old one", () => {
    const registry = new ConnectionRegistry();
    const first = new FakeSocket();
    const second = new FakeSocket();
    registry.register({
      deviceId: "dev-1",
      connectionId: "c1",
      socket: first,
      authenticatedAt: 1,
      lastHeartbeat: 1,
      lastSeen: 1,
    });
    const previous = registry.register({
      deviceId: "dev-1",
      connectionId: "c2",
      socket: second,
      authenticatedAt: 2,
      lastHeartbeat: 2,
      lastSeen: 2,
    });
    assert.equal(previous?.connectionId, "c1");
    assert.equal(registry.get("dev-1")?.connectionId, "c2");
  });

  it("ignores stale socket cleanup for a newer generation", () => {
    const registry = new ConnectionRegistry();
    const socket = new FakeSocket();
    registry.register({
      deviceId: "dev-1",
      connectionId: "c2",
      socket,
      authenticatedAt: 2,
      lastHeartbeat: 2,
      lastSeen: 2,
    });
    assert.equal(registry.remove("dev-1", "c1"), false);
    assert.equal(registry.isOnline("dev-1"), true);
    assert.equal(registry.remove("dev-1", "c2"), true);
    assert.equal(registry.isOnline("dev-1"), false);
  });
});

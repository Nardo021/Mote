import { PROTOCOL_VERSION } from "../protocol/protocolVersion.js";
import type { HeartbeatAckMessage } from "../protocol/messages.js";
import type { ConnectionRegistry, DeviceConnection } from "./connectionRegistry.js";

export function createHeartbeatAck(sentAt: number, serverAt: number): HeartbeatAckMessage {
  return {
    type: "heartbeat_ack",
    version: PROTOCOL_VERSION,
    sent_at: sentAt,
    server_at: serverAt,
  };
}

export function isHeartbeatStale(lastHeartbeat: number, now: number, staleMs: number): boolean {
  return now - lastHeartbeat > staleMs;
}

export function startStaleConnectionSweeper(
  registry: ConnectionRegistry,
  staleMs: number,
  intervalMs: number,
  onStale: (connection: DeviceConnection) => void,
): { stop: () => void } {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const connection of registry.staleConnections(now, staleMs)) {
      onStale(connection);
    }
  }, intervalMs);
  timer.unref();
  return {
    stop() {
      clearInterval(timer);
    },
  };
}

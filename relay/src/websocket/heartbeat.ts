import { PROTOCOL_VERSION } from "../protocol/protocolVersion.js";
import type { HeartbeatAckMessage } from "../protocol/messages.js";

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

import { PROTOCOL_VERSION } from "./protocolVersion.js";
import {
  isCommandResultStatus,
  type AuthMessage,
  type CommandResultMessage,
  type HeartbeatMessage,
  type IncomingDeviceMessage,
  type OutgoingDeviceMessage,
} from "./messages.js";

export type ProtocolParseFailure =
  | "malformed_json"
  | "invalid_message"
  | "unsupported_version"
  | "unknown_type";

export type ProtocolParseResult =
  | { ok: true; message: IncomingDeviceMessage }
  | { ok: false; reason: ProtocolParseFailure };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readVersion(value: unknown): boolean {
  return value === PROTOCOL_VERSION;
}

function parseAuth(value: Record<string, unknown>): AuthMessage | undefined {
  const deviceId = readString(value.device_id);
  const credential = readString(value.credential);
  if (deviceId === undefined || credential === undefined) {
    return undefined;
  }
  return {
    type: "auth",
    version: PROTOCOL_VERSION,
    device_id: deviceId,
    credential,
  };
}

function parseHeartbeat(value: Record<string, unknown>): HeartbeatMessage | undefined {
  const deviceId = readString(value.device_id);
  const sentAt = readNumber(value.sent_at);
  if (deviceId === undefined || sentAt === undefined) {
    return undefined;
  }
  return {
    type: "heartbeat",
    version: PROTOCOL_VERSION,
    device_id: deviceId,
    sent_at: sentAt,
  };
}

function parseCommandResult(value: Record<string, unknown>): CommandResultMessage | undefined {
  const commandId = readString(value.command_id);
  const status = readString(value.status);
  const completedAt = readNumber(value.completed_at);
  if (commandId === undefined || status === undefined || completedAt === undefined) {
    return undefined;
  }
  if (!isCommandResultStatus(status)) {
    return undefined;
  }
  const result: CommandResultMessage = {
    type: "command_result",
    version: PROTOCOL_VERSION,
    command_id: commandId,
    status,
    completed_at: completedAt,
  };
  const error = readString(value.error);
  if (error !== undefined) {
    result.error = error;
  }
  return result;
}

export function parseIncomingDeviceMessage(raw: string): ProtocolParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "malformed_json" };
  }
  if (!isRecord(parsed)) {
    return { ok: false, reason: "invalid_message" };
  }
  if (!readVersion(parsed.version)) {
    return { ok: false, reason: "unsupported_version" };
  }
  const type = readString(parsed.type);
  if (type === undefined) {
    return { ok: false, reason: "invalid_message" };
  }
  switch (type) {
    case "auth": {
      const message = parseAuth(parsed);
      return message ? { ok: true, message } : { ok: false, reason: "invalid_message" };
    }
    case "heartbeat": {
      const message = parseHeartbeat(parsed);
      return message ? { ok: true, message } : { ok: false, reason: "invalid_message" };
    }
    case "command_result": {
      const message = parseCommandResult(parsed);
      return message ? { ok: true, message } : { ok: false, reason: "invalid_message" };
    }
    default:
      return { ok: false, reason: "unknown_type" };
  }
}

export function encodeOutgoing(message: OutgoingDeviceMessage): string {
  return JSON.stringify(message);
}

export function rawDataToString(raw: unknown): string {
  if (typeof raw === "string") {
    return raw;
  }
  if (raw instanceof Buffer) {
    return raw.toString("utf8");
  }
  if (raw instanceof ArrayBuffer) {
    return Buffer.from(raw).toString("utf8");
  }
  if (Array.isArray(raw)) {
    return Buffer.concat(raw.filter((part): part is Buffer => part instanceof Buffer)).toString("utf8");
  }
  return String(raw);
}

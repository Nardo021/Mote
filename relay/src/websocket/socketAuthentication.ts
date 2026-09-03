import { authenticateDevice } from "../auth/deviceAuth.js";
import type { DeviceRepository } from "../devices/deviceRepository.js";
import { encodeOutgoing } from "../protocol/codec.js";
import type { AuthMessage, AuthResultMessage } from "../protocol/messages.js";
import { PROTOCOL_VERSION } from "../protocol/protocolVersion.js";

export function authResultOk(): AuthResultMessage {
  return {
    type: "auth_result",
    version: PROTOCOL_VERSION,
    status: "ok",
  };
}

export function authResultError(error: string): AuthResultMessage {
  return {
    type: "auth_result",
    version: PROTOCOL_VERSION,
    status: "error",
    error,
  };
}

export function encodeAuthResult(result: AuthResultMessage): string {
  return encodeOutgoing(result);
}

export function verifyAuthMessage(message: AuthMessage, devices: DeviceRepository) {
  return authenticateDevice(message, devices);
}

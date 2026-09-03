import type { DeviceRepository } from "../devices/deviceRepository.js";
import type { DeviceRecord } from "../devices/deviceTypes.js";
import type { AuthMessage } from "../protocol/messages.js";
import { PROTOCOL_VERSION } from "../protocol/protocolVersion.js";
import { verifySecret } from "./tokenHash.js";

export type DeviceAuthSuccess = {
  ok: true;
  device: DeviceRecord;
};

export type DeviceAuthFailure = {
  ok: false;
  error: "invalid_credentials" | "unsupported_version";
};

export type DeviceAuthResult = DeviceAuthSuccess | DeviceAuthFailure;

export function authenticateDevice(
  message: AuthMessage,
  devices: DeviceRepository,
): DeviceAuthResult {
  if (message.version !== PROTOCOL_VERSION) {
    return { ok: false, error: "unsupported_version" };
  }
  const device = devices.findById(message.device_id);
  if (!device || !device.enabled) {
    return { ok: false, error: "invalid_credentials" };
  }
  if (!verifySecret(message.credential, device.credentialHash)) {
    return { ok: false, error: "invalid_credentials" };
  }
  return { ok: true, device };
}

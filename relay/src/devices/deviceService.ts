import { hashSecret } from "../auth/tokenHash.js";
import { Permission } from "../auth/permissions.js";
import { AppError, ErrorCode, invalidRequest } from "../utils/errors.js";
import { createId, createSecret } from "../utils/ids.js";
import { nowMs } from "../utils/time.js";
import type { DeviceRepository } from "./deviceRepository.js";
import type { CreatedDevice, DeviceRecord } from "./deviceTypes.js";
import type { TokenRepository } from "./tokenRepository.js";
import type { CreatedApiToken } from "./tokenTypes.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class DeviceService {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly tokens: TokenRepository,
  ) {}

  createDevice(name: string, deviceId?: string): CreatedDevice {
    const trimmed = name.trim();
    if (trimmed === "") {
      throw invalidRequest("Device name is required.");
    }
    const id =
      deviceId === undefined || deviceId === "" ? createId() : deviceId;
    if (!UUID_PATTERN.test(id)) {
      throw invalidRequest("Device ID must be a UUID.");
    }
    if (this.devices.findById(id)) {
      throw new AppError(
        ErrorCode.INVALID_REQUEST,
        "Device ID already exists.",
        409,
      );
    }
    const credential = createSecret();
    const createdAt = nowMs();
    this.devices.insert({
      id,
      name: trimmed,
      credentialHash: hashSecret(credential),
      enabled: true,
      createdAt,
      updatedAt: createdAt,
      lastSeenAt: null,
      appVersion: null,
    });
    return { id, name: trimmed, credential, createdAt };
  }

  listDevices(): DeviceRecord[] {
    return this.devices.list();
  }

  getDevice(id: string): DeviceRecord | undefined {
    return this.devices.findById(id);
  }

  requireDevice(id: string): DeviceRecord {
    const device = this.devices.findById(id);
    if (!device) {
      throw new AppError(ErrorCode.DEVICE_NOT_FOUND, "Device not found.", 404, {
        device_id: id,
      });
    }
    return device;
  }

  disableDevice(id: string): DeviceRecord {
    const device = this.requireDevice(id);
    this.devices.setEnabled(id, false);
    return { ...device, enabled: false, updatedAt: nowMs() };
  }

  enableDevice(id: string): DeviceRecord {
    const device = this.requireDevice(id);
    this.devices.setEnabled(id, true);
    return { ...device, enabled: true, updatedAt: nowMs() };
  }

  rotateDeviceCredential(id: string): {
    device: DeviceRecord;
    credential: string;
  } {
    const device = this.requireDevice(id);
    const credential = createSecret();
    this.devices.updateCredentialHash(id, hashSecret(credential));
    return { device, credential };
  }

  markLastSeen(id: string, at: number = nowMs()): void {
    this.devices.updateLastSeen(id, at);
  }

  recordAppVersion(id: string, appVersion: string): void {
    this.devices.updateAppVersion(id, appVersion);
  }

  createShortcutToken(name: string): CreatedApiToken {
    const trimmed = name.trim();
    if (trimmed === "") {
      throw invalidRequest("Token name is required.");
    }
    const token = createSecret();
    const createdAt = nowMs();
    const id = createId();
    this.tokens.insert({
      id,
      name: trimmed,
      tokenHash: hashSecret(token),
      permission: Permission.send_command,
      enabled: true,
      createdAt,
      lastUsedAt: null,
    });
    return {
      id,
      name: trimmed,
      token,
      permission: Permission.send_command,
      createdAt,
    };
  }

  listTokens() {
    return this.tokens.list().map((token) => ({
      id: token.id,
      name: token.name,
      permission: token.permission,
      enabled: token.enabled,
      createdAt: token.createdAt,
      lastUsedAt: token.lastUsedAt,
    }));
  }

  requireToken(id: string) {
    const token = this.tokens.findById(id);
    if (!token) {
      throw new AppError(ErrorCode.INVALID_REQUEST, "Token not found.", 404);
    }
    return token;
  }

  disableToken(id: string) {
    const token = this.requireToken(id);
    this.tokens.setEnabled(id, false);
    return { ...token, enabled: false };
  }

  enableToken(id: string) {
    const token = this.requireToken(id);
    this.tokens.setEnabled(id, true);
    return { ...token, enabled: true };
  }

  rotateShortcutToken(id: string): CreatedApiToken {
    const token = this.requireToken(id);
    const secret = createSecret();
    this.tokens.updateTokenHash(id, hashSecret(secret));
    return {
      id: token.id,
      name: token.name,
      token: secret,
      permission: token.permission,
      createdAt: token.createdAt,
    };
  }

  touchToken(id: string, at: number = nowMs()): void {
    this.tokens.updateLastUsed(id, at);
  }
}

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { authenticateDevice } from "../src/auth/deviceAuth.js";
import { Permission } from "../src/auth/permissions.js";
import { authenticateShortcutToken } from "../src/auth/shortcutAuth.js";
import { hashSecret } from "../src/auth/tokenHash.js";
import { DeviceRepository } from "../src/devices/deviceRepository.js";
import { DeviceService } from "../src/devices/deviceService.js";
import { TokenRepository } from "../src/devices/tokenRepository.js";
import { openMemoryDatabase } from "../src/storage/database.js";
import { AppError, ErrorCode } from "../src/utils/errors.js";
import { nowMs } from "../src/utils/time.js";
import { TEST_DEVICE_ID } from "./helpers.js";

function setup() {
  const db = openMemoryDatabase();
  const deviceRepository = new DeviceRepository(db);
  const tokenRepository = new TokenRepository(db);
  const devices = new DeviceService(deviceRepository, tokenRepository);
  return { db, deviceRepository, tokenRepository, devices };
}

describe("credential authentication", () => {
  it("accepts a valid Shortcut send_command token", () => {
    const { db, tokenRepository, devices } = setup();
    const created = devices.createShortcutToken("Leo iPhone");
    const client = authenticateShortcutToken(`Bearer ${created.token}`, tokenRepository);
    assert.equal(client.permission, Permission.send_command);
    assert.equal(client.tokenId, created.id);
    db.close();
  });

  it("rejects a missing or invalid Shortcut token", () => {
    const { db, tokenRepository } = setup();
    assert.throws(
      () => authenticateShortcutToken(undefined, tokenRepository),
      (error: unknown) => error instanceof AppError && error.code === ErrorCode.UNAUTHORIZED,
    );
    assert.throws(
      () => authenticateShortcutToken("Bearer nope", tokenRepository),
      (error: unknown) => error instanceof AppError && error.code === ErrorCode.UNAUTHORIZED,
    );
    db.close();
  });

  it("rejects a device_connection secret on the HTTP command path", () => {
    const { db, tokenRepository } = setup();
    tokenRepository.insert({
      id: "tok-role",
      name: "wrong-role",
      tokenHash: hashSecret("device-shaped-secret"),
      permission: Permission.device_connection,
      enabled: true,
      createdAt: nowMs(),
      lastUsedAt: null,
    });
    assert.throws(
      () => authenticateShortcutToken("Bearer device-shaped-secret", tokenRepository),
      (error: unknown) => error instanceof AppError && error.code === ErrorCode.FORBIDDEN,
    );
    db.close();
  });

  it("accepts a valid Mac device credential", () => {
    const { db, deviceRepository, devices } = setup();
    const created = devices.createDevice("MacBook Pro", TEST_DEVICE_ID);
    const result = authenticateDevice(
      { type: "auth", version: 1, device_id: created.id, credential: created.credential },
      deviceRepository,
    );
    assert.equal(result.ok, true);
    db.close();
  });

  it("rejects an invalid Mac credential", () => {
    const { db, deviceRepository, devices } = setup();
    const created = devices.createDevice("MacBook Pro", TEST_DEVICE_ID);
    const result = authenticateDevice(
      { type: "auth", version: 1, device_id: created.id, credential: "wrong" },
      deviceRepository,
    );
    assert.deepEqual(result, { ok: false, error: "invalid_credentials" });
    db.close();
  });

  it("rejects a disabled device", () => {
    const { db, deviceRepository, devices } = setup();
    const created = devices.createDevice("MacBook Pro", TEST_DEVICE_ID);
    devices.disableDevice(created.id);
    const result = authenticateDevice(
      { type: "auth", version: 1, device_id: created.id, credential: created.credential },
      deviceRepository,
    );
    assert.deepEqual(result, { ok: false, error: "invalid_credentials" });
    db.close();
  });
});

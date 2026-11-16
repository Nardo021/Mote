import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizeCloudLock,
  type AuthenticatedCloudSession,
  type CloudLockRequest,
  type OwnedCloudDevice,
} from "../src/cloud/authorization.js";

const accountA = "11111111-1111-4111-8111-111111111111";
const accountB = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const deviceId = "44444444-4444-4444-8444-444444444444";
const otherDeviceId = "55555555-5555-4555-8555-555555555555";

const session: AuthenticatedCloudSession = {
  accountId: accountA,
  sessionId,
  expiresAtMs: 20_000,
  revokedAtMs: null,
  accountStatus: "active",
};
const device: OwnedCloudDevice = {
  id: deviceId,
  ownerAccountId: accountA,
  status: "active",
};
const valid: CloudLockRequest = {
  session,
  device,
  requestedDeviceId: deviceId,
  requestedAction: "lock",
  nowMs: 10_000,
};

test("allows exactly lock on an active account-owned device", () => {
  assert.deepEqual(authorizeCloudLock(valid), {
    allowed: true,
    deviceId,
    tenantAccountId: accountA,
    action: "lock",
  });
});

test("rejects absent, expired and revoked sessions before looking up a device", () => {
  const blocked: CloudLockRequest[] = [
    { ...valid, session: null },
    { ...valid, nowMs: 20_000 },
    { ...valid, session: { ...session, revokedAtMs: 9_000 } },
    { ...valid, session: { ...session, accountStatus: "disabled" } },
    { ...valid, session: { ...session, accountId: "not-a-uuid" } },
    { ...valid, session: { ...session, sessionId: "not-a-uuid" } },
    { ...valid, nowMs: Number.NaN },
  ];
  for (const request of blocked) {
    assert.deepEqual(authorizeCloudLock(request), {
      allowed: false,
      status: 401,
      reason: "unauthenticated",
    });
  }
});

test("does not reveal whether another account's device exists", () => {
  const foreignDevice: OwnedCloudDevice = { ...device, ownerAccountId: accountB };
  const missing = authorizeCloudLock({ ...valid, device: null });
  const crossAccount = authorizeCloudLock({ ...valid, device: foreignDevice });
  const disabled = authorizeCloudLock({
    ...valid,
    device: { ...device, status: "revoked" },
  });
  const targetMismatch = authorizeCloudLock({ ...valid, requestedDeviceId: otherDeviceId });
  const malformedTarget = authorizeCloudLock({ ...valid, requestedDeviceId: "__proto__" });
  const expected = { allowed: false, status: 404, reason: "not_found" };
  for (const result of [missing, crossAccount, disabled, targetMismatch, malformedTarget]) {
    assert.deepEqual(result, expected);
  }
});

test("rejects remote unlock, shell-like and unknown actions even for the owner", () => {
  for (const requestedAction of [
    "unlock",
    "sleep",
    "powershell -Command Start-Process",
    { action: "lock" },
    null,
    "",
  ]) {
    assert.deepEqual(authorizeCloudLock({ ...valid, requestedAction }), {
      allowed: false,
      status: 422,
      reason: "unsupported_action",
    });
  }
});

test("checks account ownership before unsupported action so foreign devices remain opaque", () => {
  assert.deepEqual(
    authorizeCloudLock({
      ...valid,
      device: { ...device, ownerAccountId: accountB },
      requestedAction: "unlock",
    }),
    { allowed: false, status: 404, reason: "not_found" },
  );
});

test("does not route to a requester-supplied account or device ID", () => {
  const result = authorizeCloudLock({
    ...valid,
    session: { ...session, accountId: accountB },
  });
  assert.deepEqual(result, { allowed: false, status: 404, reason: "not_found" });
  const owned = authorizeCloudLock(valid);
  assert.equal(owned.allowed, true);
  if (owned.allowed) {
    assert.equal(owned.tenantAccountId, device.ownerAccountId);
    assert.equal(owned.deviceId, device.id);
  }
});

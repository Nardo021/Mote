import { isUuid } from "../utils/ids.js";

/**
 * These values MUST come from a trusted session lookup and D1 ownership query.
 * Do not construct them from JSON, URL parameters, headers or decoded (but
 * unverified) identity tokens.
 */
export type AuthenticatedCloudSession = Readonly<{
  accountId: string;
  sessionId: string;
  expiresAtMs: number;
  revokedAtMs: number | null;
  accountStatus: "active" | "disabled";
}>;

export type OwnedCloudDevice = Readonly<{
  id: string;
  ownerAccountId: string;
  status: "active" | "revoked";
}>;

export type CloudLockAuthorization =
  | Readonly<{
      allowed: true;
      deviceId: string;
      tenantAccountId: string;
      action: "lock";
    }>
  | Readonly<{
      allowed: false;
      status: 401 | 404 | 422;
      reason: "unauthenticated" | "not_found" | "unsupported_action";
    }>;

export type CloudLockRequest = Readonly<{
  /** Resolved from verified, non-revoked login, never the request body. */
  session: AuthenticatedCloudSession | null;
  /** Resolved from the hosted device database, never from the request body. */
  device: OwnedCloudDevice | null;
  requestedDeviceId: string;
  requestedAction: unknown;
  nowMs: number;
}>;

/**
 * Fail-closed policy for the hosted API. This does not authenticate callers,
 * access D1 or dispatch a command: those boundaries need their own tests.
 *
 * Check the owner and device state BEFORE validating the action so that a
 * cross-account request cannot distinguish another user's device metadata.
 * The resulting DO routing key is taken from the database row, not user input.
 */
export function authorizeCloudLock(request: CloudLockRequest): CloudLockAuthorization {
  const { session, device, requestedDeviceId, requestedAction, nowMs } = request;
  if (
    session === null ||
    !isUuid(session.accountId) ||
    !isUuid(session.sessionId) ||
    session.accountStatus !== "active" ||
    session.revokedAtMs !== null ||
    !Number.isSafeInteger(session.expiresAtMs) ||
    !Number.isSafeInteger(nowMs) ||
    nowMs < 0 ||
    session.expiresAtMs <= nowMs
  ) {
    return { allowed: false, status: 401, reason: "unauthenticated" };
  }

  if (
    !isUuid(requestedDeviceId) ||
    device === null ||
    !isUuid(device.id) ||
    !isUuid(device.ownerAccountId) ||
    device.id !== requestedDeviceId ||
    device.ownerAccountId !== session.accountId ||
    device.status !== "active"
  ) {
    // Do not differentiate a missing device from another tenant's device.
    return { allowed: false, status: 404, reason: "not_found" };
  }

  if (requestedAction !== "lock") {
    return { allowed: false, status: 422, reason: "unsupported_action" };
  }

  return {
    allowed: true,
    deviceId: device.id,
    tenantAccountId: device.ownerAccountId,
    action: "lock",
  };
}

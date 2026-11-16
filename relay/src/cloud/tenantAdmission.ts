import { createHash } from "node:crypto";
import { authorizeCloudLock, type CloudLockAuthorization } from "./authorization.js";
import { CloudIdentityRepository, type CloudD1Database } from "./identityRepository.js";
import { isUuid } from "../utils/ids.js";

const RAW_PROOF = /^[A-Za-z0-9_-]{32,128}$/;

export type VerifiedCloudDeviceAdmission = Readonly<{
  deviceId: string;
  /** Authoritative owner from D1, never client-supplied. */
  tenantAccountId: string;
}>;

/**
 * Fail-closed admission decision for a future Cloud device WebSocket.
 * Must run before entering any tenant Durable Object, and again after a
 * connection restart / credential revocation. It does NOT accept a socket.
 *
 * The desktop's raw credential MUST be read from the existing v1 "auth"
 * frame or another authenticated transport, not a URL query parameter.
 */
export async function authorizeCloudDeviceAdmission(
  db: CloudD1Database,
  deviceId: string,
  rawCredential: string,
): Promise<VerifiedCloudDeviceAdmission | null> {
  if (!isUuid(deviceId) || !RAW_PROOF.test(rawCredential)) return null;
  const credentialHash = createHash("sha256").update(rawCredential, "utf8").digest("hex");
  const row = await db.prepare(
    `SELECT d.id, d.owner_account_id
     FROM cloud_devices d
     INNER JOIN cloud_accounts a ON a.id = d.owner_account_id
     WHERE d.id = ? AND d.credential_hash = ?
       AND d.status = 'active' AND a.status = 'active'`,
  ).bind(deviceId, credentialHash).first<{ id: string; owner_account_id: string }>();
  if (!row || !isUuid(row.owner_account_id)) return null;
  return { deviceId: row.id, tenantAccountId: row.owner_account_id };
}

/**
 * Only a verified session can obtain the tenant's name for command dispatch.
 * This is a policy/composition function, not the command execution endpoint.
 */
export async function authorizeCloudCommandAdmission(
  db: CloudD1Database,
  accessToken: string,
  deviceId: string,
  action: unknown,
  nowMs: number,
): Promise<CloudLockAuthorization> {
  const identity = new CloudIdentityRepository(db);
  const session = await identity.authenticateAccess(accessToken, nowMs);
  // Never look up device metadata for unauthenticated callers.
  if (!session) return { allowed: false, status: 401, reason: "unauthenticated" };
  const device = isUuid(deviceId) ? await identity.getActiveDevice(deviceId) : null;
  return authorizeCloudLock({ session, device, requestedDeviceId: deviceId, requestedAction: action, nowMs });
}

/** Use ONLY verified admissions' tenantAccountId as idFromName input. */
export function cloudTenantObjectKey(admission: VerifiedCloudDeviceAdmission): string {
  if (!isUuid(admission.deviceId) || !isUuid(admission.tenantAccountId)) {
    throw new Error("Unverified tenant admission.");
  }
  return `mote-cloud-account:${admission.tenantAccountId}`;
}

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { isUuid } from "../utils/ids.js";
import type { CloudD1Database } from "./identityRepository.js";

const HEX_DIGEST = /^[a-f0-9]{64}$/;
const RAW_PROOF = /^[A-Za-z0-9_-]{32,128}$/;
const TTL_MS = 5 * 60_000;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function newSecret(): string {
  return randomBytes(32).toString("base64url");
}
function validName(name: unknown): name is string {
  return typeof name === "string" && name.length >= 1 &&
    name.length <= 120 && name.trim() === name && name.trim().length > 0;
}
function validTime(nowMs: number): boolean {
  return Number.isSafeInteger(nowMs) && nowMs > 0 && nowMs < Number.MAX_SAFE_INTEGER - TTL_MS;
}

export type CloudPairingRegistration = Readonly<{
  deviceId: string;
  deviceName: string;
  platform: "macos" | "windows";
  /** SHA-256 of a 256-bit device secret generated and retained on the desktop. */
  deviceCredentialHash: string;
  /** SHA-256 of a separate 256-bit polling secret retained only on the desktop. */
  pollSecretHash: string;
}>;

export type PairingPreview = Readonly<{
  deviceName: string;
  platform: "macos" | "windows";
  verificationCode: string;
  expiresAtMs: number;
}>;

/** This code confirms both screens show the same QR claim; it is not a credential. */
export function pairingVerificationCode(ticketId: string, claimSecret: string): string {
  const value = createHash("sha256")
    .update(`mote-cloud-pair-code:\0${ticketId}:\0${claimSecret}`, "utf8").digest();
  return String(value.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

export class CloudPairingRepository {
  constructor(private readonly db: CloudD1Database) {}

  async create(reg: CloudPairingRegistration, nowMs: number): Promise<
    { ticketId: string; claimSecret: string; verificationCode: string; expiresAtMs: number } | null
  > {
    if (!validTime(nowMs) || !isUuid(reg.deviceId) ||
        !validName(reg.deviceName) ||
        (reg.platform !== "macos" && reg.platform !== "windows") ||
        !HEX_DIGEST.test(reg.deviceCredentialHash) ||
        !HEX_DIGEST.test(reg.pollSecretHash) ||
        reg.deviceCredentialHash === reg.pollSecretHash) {
      return null;
    }
    // A previously expired attempt may be replaced; never overwrite an approved
    // or still-pending ticket, and never replace an already registered device.
    await this.db.prepare(
      `UPDATE cloud_pairing_tickets SET status = 'expired'
       WHERE device_id = ? AND status = 'pending' AND expires_at_ms <= ?`,
    ).bind(reg.deviceId, nowMs).run();

    const existing = await this.db.prepare(
      "SELECT id FROM cloud_devices WHERE id = ?",
    ).bind(reg.deviceId).first<{ id: string }>();
    if (existing) return null;

    const ticketId = randomUUID();
    const claimSecret = newSecret();
    const expiresAtMs = nowMs + TTL_MS;
    try {
      await this.db.prepare(
        `INSERT INTO cloud_pairing_tickets
         (id, device_id, device_name, device_platform, claim_secret_hash,
          poll_secret_hash, device_credential_hash, status, created_at_ms, expires_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      ).bind(
        ticketId, reg.deviceId, reg.deviceName, reg.platform,
        sha256(claimSecret), reg.pollSecretHash,
        reg.deviceCredentialHash, nowMs, expiresAtMs,
      ).run();
    } catch {
      // A concurrent ticket or duplicate ID may win; fail closed.
      return null;
    }
    return {
      ticketId, claimSecret, expiresAtMs,
      verificationCode: pairingVerificationCode(ticketId, claimSecret),
    };
  }

  /** Owner preview requires the server-verified iOS account plus secret. */
  async preview(ticketId: string, claimSecret: string, nowMs: number): Promise<PairingPreview | null> {
    if (!isUuid(ticketId) || !RAW_PROOF.test(claimSecret) || !validTime(nowMs)) return null;
    const row = await this.db.prepare(
      `SELECT device_name, device_platform, expires_at_ms
       FROM cloud_pairing_tickets
       WHERE id = ? AND claim_secret_hash = ?
         AND status = 'pending' AND expires_at_ms > ?`,
    ).bind(ticketId, sha256(claimSecret), nowMs).first<{
      device_name: string; device_platform: "macos" | "windows"; expires_at_ms: number;
    }>();
    if (!row) return null;
    return {
      deviceName: row.device_name,
      platform: row.device_platform,
      expiresAtMs: row.expires_at_ms,
      verificationCode: pairingVerificationCode(ticketId, claimSecret),
    };
  }

  /**
   * Single SQL UPDATE, with database trigger atomically inserting the device.
   * One winner: a 2nd account, replay, expired ticket or duplicate device
   * returns false. Any INSERT constraint failure aborts and rolls back UPDATE.
   */
  async approve(ticketId: string, claimSecret: string, accountId: string, nowMs: number):
      Promise<boolean> {
    if (!isUuid(ticketId) || !isUuid(accountId) ||
        !RAW_PROOF.test(claimSecret) || !validTime(nowMs)) return false;
    try {
      const result = await this.db.prepare(
        `UPDATE cloud_pairing_tickets
         SET status = 'approved', claimed_by_account_id = ?
         WHERE id = ? AND claim_secret_hash = ?
           AND status = 'pending' AND expires_at_ms > ?
           AND EXISTS (SELECT 1 FROM cloud_accounts
                       WHERE id = ? AND status = 'active')
           AND NOT EXISTS (
             SELECT 1 FROM cloud_devices d
             WHERE d.id = cloud_pairing_tickets.device_id
           )`,
      ).bind(accountId, ticketId, sha256(claimSecret), nowMs, accountId).run();
      return result.meta.changes === 1;
    } catch {
      // Trigger insertion fails transactionally on revoked/duplicate credential.
      return false;
    }
  }

  /** Desktop-only status: authenticated by its separate 256-bit polling proof. */
  async poll(ticketId: string, pollSecret: string, nowMs: number):
    Promise<"pending" | "approved" | "rejected" | "expired" | null> {
    if (!isUuid(ticketId) || !RAW_PROOF.test(pollSecret) || !validTime(nowMs)) return null;
    const row = await this.db.prepare(
      `SELECT status, expires_at_ms FROM cloud_pairing_tickets
       WHERE id = ? AND poll_secret_hash = ?`,
    ).bind(ticketId, sha256(pollSecret)).first<{
      status: "pending" | "approved" | "rejected" | "expired"; expires_at_ms: number;
    }>();
    if (!row) return null;
    if (row.status === "pending" && row.expires_at_ms <= nowMs) return "expired";
    return row.status;
  }
}

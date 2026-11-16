import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hashAppleNonce } from "./appleIdentity.js";
import type { AuthenticatedCloudSession, OwnedCloudDevice } from "./authorization.js";

type SqlValue = string | number | null;

/** Minimal Cloudflare D1 binding surface, also used by the Node SQLite tests. */
export interface CloudD1Statement {
  bind(...values: SqlValue[]): CloudD1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface CloudD1Database {
  prepare(sql: string): CloudD1Statement;
}

export type CloudSessionTokens = Readonly<{
  accessToken: string;
  refreshToken: string;
  accessExpiresAtMs: number;
  refreshExpiresAtMs: number;
}>;

const ACCESS_LIFETIME_MS = 15 * 60_000;
const REFRESH_LIFETIME_MS = 30 * 24 * 60 * 60_000;
const CHALLENGE_LIFETIME_MS = 5 * 60_000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

function tokenHash(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export class CloudIdentityRepository {
  constructor(private readonly db: CloudD1Database) {}

  async createChallenge(nowMs: number): Promise<{
    challengeId: string;
    nonce: string;
    expiresAtMs: number;
  }> {
    if (!Number.isSafeInteger(nowMs) || nowMs <= 0) {
      throw new Error("Invalid request time.");
    }
    const challengeId = randomUUID();
    const nonce = randomToken();
    const expiresAtMs = nowMs + CHALLENGE_LIFETIME_MS;
    await this.db.prepare(
      `INSERT INTO cloud_auth_challenges
       (id, nonce_hash, created_at_ms, expires_at_ms) VALUES(?, ?, ?, ?)`,
    ).bind(challengeId, hashAppleNonce(nonce), nowMs, expiresAtMs).run();
    return { challengeId, nonce, expiresAtMs };
  }

  /** Returns only a server-stored nonce hash. The mobile client cannot set it. */
  async pendingChallengeHash(challengeId: string, nowMs: number): Promise<string | null> {
    if (typeof challengeId !== "string" || !/^[a-f0-9-]{36}$/i.test(challengeId)) {
      return null;
    }
    const row = await this.db.prepare(
      `SELECT nonce_hash FROM cloud_auth_challenges
       WHERE id = ? AND used_at_ms IS NULL AND expires_at_ms > ?`,
    ).bind(challengeId, nowMs).first<{ nonce_hash: string }>();
    return row?.nonce_hash ?? null;
  }

  /** Atomic single-winner replay gate: never log in unless changes === 1. */
  async consumeChallenge(challengeId: string, expectedHash: string, nowMs: number): Promise<boolean> {
    const result = await this.db.prepare(
      `UPDATE cloud_auth_challenges SET used_at_ms = ?
       WHERE id = ? AND nonce_hash = ? AND used_at_ms IS NULL AND expires_at_ms > ?`,
    ).bind(nowMs, challengeId, expectedHash, nowMs).run();
    return result.meta.changes === 1;
  }

  async createOrGetAccount(verifiedAppleSubject: string, nowMs: number): Promise<string | null> {
    if (verifiedAppleSubject.length === 0 || verifiedAppleSubject.length > 256) {
      return null;
    }
    await this.db.prepare(
      `INSERT INTO cloud_accounts (id, apple_subject, status, created_at_ms)
       VALUES(?, ?, 'active', ?) ON CONFLICT(apple_subject) DO NOTHING`,
    ).bind(randomUUID(), verifiedAppleSubject, nowMs).run();
    const account = await this.db.prepare(
      "SELECT id, status FROM cloud_accounts WHERE apple_subject = ?",
    ).bind(verifiedAppleSubject).first<{ id: string; status: string }>();
    return account?.status === "active" ? account.id : null;
  }

  async issueSession(accountId: string, nowMs: number): Promise<CloudSessionTokens> {
    const accessToken = randomToken();
    const refreshToken = randomToken();
    const accessExpiresAtMs = nowMs + ACCESS_LIFETIME_MS;
    const refreshExpiresAtMs = nowMs + REFRESH_LIFETIME_MS;
    await this.db.prepare(
      `INSERT INTO cloud_sessions
       (id, account_id, refresh_token_hash, access_token_hash,
        created_at_ms, expires_at_ms, access_expires_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      randomUUID(), accountId, tokenHash(refreshToken), tokenHash(accessToken),
      nowMs, refreshExpiresAtMs, accessExpiresAtMs,
    ).run();
    return { accessToken, refreshToken, accessExpiresAtMs, refreshExpiresAtMs };
  }

  async authenticateAccess(rawToken: string, nowMs: number): Promise<AuthenticatedCloudSession | null> {
    if (!TOKEN_PATTERN.test(rawToken)) {
      return null;
    }
    const row = await this.db.prepare(
      `SELECT s.id AS session_id, s.account_id, s.expires_at_ms,
              s.revoked_at_ms, a.status AS account_status
       FROM cloud_sessions s
       JOIN cloud_accounts a ON a.id = s.account_id
       WHERE s.access_token_hash = ? AND s.access_expires_at_ms > ?
         AND s.expires_at_ms > ? AND s.revoked_at_ms IS NULL
         AND a.status = 'active'`,
    ).bind(tokenHash(rawToken), nowMs, nowMs).first<{
      session_id: string; account_id: string; expires_at_ms: number;
      revoked_at_ms: number | null; account_status: "active";
    }>();
    if (!row) return null;
    return {
      sessionId: row.session_id, accountId: row.account_id,
      expiresAtMs: row.expires_at_ms, revokedAtMs: row.revoked_at_ms,
      accountStatus: row.account_status,
    };
  }

  /** Refresh rotation uses one conditional UPDATE: simultaneous reuse fails. */
  async rotateRefresh(rawToken: string, nowMs: number): Promise<CloudSessionTokens | null> {
    if (!TOKEN_PATTERN.test(rawToken)) return null;
    const accessToken = randomToken();
    const refreshToken = randomToken();
    const accessExpiresAtMs = nowMs + ACCESS_LIFETIME_MS;
    const result = await this.db.prepare(
      `UPDATE cloud_sessions
       SET refresh_token_hash = ?, access_token_hash = ?, access_expires_at_ms = ?
       WHERE refresh_token_hash = ? AND revoked_at_ms IS NULL AND expires_at_ms > ?
         AND EXISTS (
           SELECT 1 FROM cloud_accounts a
           WHERE a.id = cloud_sessions.account_id AND a.status = 'active'
         )`,
    ).bind(
      tokenHash(refreshToken), tokenHash(accessToken), accessExpiresAtMs,
      tokenHash(rawToken), nowMs,
    ).run();
    if (result.meta.changes !== 1) return null;
    // Refresh expiry is fixed at session creation; no unbounded extension.
    const row = await this.db.prepare(
      "SELECT expires_at_ms FROM cloud_sessions WHERE refresh_token_hash = ?",
    ).bind(tokenHash(refreshToken)).first<{ expires_at_ms: number }>();
    if (!row) return null;
    return { accessToken, refreshToken, accessExpiresAtMs, refreshExpiresAtMs: row.expires_at_ms };
  }

  async revokeAccessSession(rawToken: string, nowMs: number): Promise<boolean> {
    if (!TOKEN_PATTERN.test(rawToken)) return false;
    const result = await this.db.prepare(
      `UPDATE cloud_sessions SET revoked_at_ms = ?
       WHERE access_token_hash = ? AND revoked_at_ms IS NULL
         AND access_expires_at_ms > ? AND expires_at_ms > ?`,
    ).bind(nowMs, tokenHash(rawToken), nowMs, nowMs).run();
    return result.meta.changes === 1;
  }

  async listActiveDevices(ownerAccountId: string): Promise<ReadonlyArray<
    Pick<OwnedCloudDevice, "id" | "status"> & { name: string; platform: "macos" | "windows" }
  >> {
    const rows = await this.db.prepare(
      `SELECT id, name, platform, status FROM cloud_devices
       WHERE owner_account_id = ? AND status = 'active' ORDER BY created_at_ms DESC`,
    ).bind(ownerAccountId).all<{
      id: string; name: string; platform: "macos" | "windows"; status: "active";
    }>();
    return rows.results;
  }

  /** Only for future authenticated command routing; never returns secret hashes. */
  async getActiveDevice(deviceId: string): Promise<OwnedCloudDevice | null> {
    const row = await this.db.prepare(
      "SELECT id, owner_account_id, status FROM cloud_devices WHERE id = ?",
    ).bind(deviceId).first<{
      id: string; owner_account_id: string; status: "active" | "revoked";
    }>();
    return row ? { id: row.id, ownerAccountId: row.owner_account_id, status: row.status } : null;
  }
}

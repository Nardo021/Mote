import type { MoteDatabase } from "../storage/database.js";
import { nowMs } from "../utils/time.js";
import {
  mapAdminSessionRow,
  type AdminSessionRecord,
  type AdminSessionRow,
} from "./adminTypes.js";

export class SessionRepository {
  constructor(private readonly db: MoteDatabase) {}

  insert(record: AdminSessionRecord): void {
    this.db
      .prepare(
        `INSERT INTO admin_sessions (id, admin_id, token_hash, created_at, expires_at, last_seen_at)
         VALUES (@id, @admin_id, @token_hash, @created_at, @expires_at, @last_seen_at)`,
      )
      .run({
        id: record.id,
        admin_id: record.adminId,
        token_hash: record.tokenHash,
        created_at: record.createdAt,
        expires_at: record.expiresAt,
        last_seen_at: record.lastSeenAt,
      });
  }

  findByTokenHash(tokenHash: string): AdminSessionRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT id, admin_id, token_hash, created_at, expires_at, last_seen_at
         FROM admin_sessions WHERE token_hash = ?`,
      )
      .get(tokenHash) as AdminSessionRow | undefined;
    return row ? mapAdminSessionRow(row) : undefined;
  }

  findById(id: string): AdminSessionRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT id, admin_id, token_hash, created_at, expires_at, last_seen_at
         FROM admin_sessions WHERE id = ?`,
      )
      .get(id) as AdminSessionRow | undefined;
    return row ? mapAdminSessionRow(row) : undefined;
  }

  touch(id: string, at: number = nowMs()): boolean {
    const result = this.db
      .prepare("UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?")
      .run(at, id);
    return result.changes > 0;
  }

  deleteById(id: string): boolean {
    const result = this.db
      .prepare("DELETE FROM admin_sessions WHERE id = ?")
      .run(id);
    return result.changes > 0;
  }

  deleteByAdminId(adminId: string, exceptId?: string): number {
    if (exceptId === undefined) {
      const result = this.db
        .prepare("DELETE FROM admin_sessions WHERE admin_id = ?")
        .run(adminId);
      return result.changes;
    }
    const result = this.db
      .prepare("DELETE FROM admin_sessions WHERE admin_id = ? AND id != ?")
      .run(adminId, exceptId);
    return result.changes;
  }

  deleteExpired(now: number = nowMs()): number {
    const result = this.db
      .prepare("DELETE FROM admin_sessions WHERE expires_at <= ?")
      .run(now);
    return result.changes;
  }
}

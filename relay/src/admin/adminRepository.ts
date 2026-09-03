import type { MoteDatabase } from "../storage/database.js";
import { nowMs } from "../utils/time.js";
import { mapAdminRow, type AdminRecord, type AdminRow } from "./adminTypes.js";

export class AdminRepository {
  constructor(private readonly db: MoteDatabase) {}

  insert(record: AdminRecord): void {
    this.db
      .prepare(
        `INSERT INTO admins (id, username, password_hash, enabled, created_at, updated_at, last_login_at)
         VALUES (@id, @username, @password_hash, @enabled, @created_at, @updated_at, @last_login_at)`,
      )
      .run({
        id: record.id,
        username: record.username,
        password_hash: record.passwordHash,
        enabled: record.enabled ? 1 : 0,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
        last_login_at: record.lastLoginAt,
      });
  }

  findById(id: string): AdminRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT id, username, password_hash, enabled, created_at, updated_at, last_login_at
         FROM admins WHERE id = ?`,
      )
      .get(id) as AdminRow | undefined;
    return row ? mapAdminRow(row) : undefined;
  }

  findByUsername(username: string): AdminRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT id, username, password_hash, enabled, created_at, updated_at, last_login_at
         FROM admins WHERE username = ?`,
      )
      .get(username) as AdminRow | undefined;
    return row ? mapAdminRow(row) : undefined;
  }

  list(): AdminRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, username, password_hash, enabled, created_at, updated_at, last_login_at
         FROM admins ORDER BY created_at ASC`,
      )
      .all() as AdminRow[];
    return rows.map(mapAdminRow);
  }

  count(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM admins")
      .get() as { count: number };
    return row.count;
  }

  setEnabled(id: string, enabled: boolean): boolean {
    const result = this.db
      .prepare("UPDATE admins SET enabled = ?, updated_at = ? WHERE id = ?")
      .run(enabled ? 1 : 0, nowMs(), id);
    return result.changes > 0;
  }

  updatePasswordHash(id: string, passwordHash: string): boolean {
    const result = this.db
      .prepare(
        "UPDATE admins SET password_hash = ?, updated_at = ? WHERE id = ?",
      )
      .run(passwordHash, nowMs(), id);
    return result.changes > 0;
  }

  updateLastLogin(id: string, at: number = nowMs()): boolean {
    const result = this.db
      .prepare(
        "UPDATE admins SET last_login_at = ?, updated_at = ? WHERE id = ?",
      )
      .run(at, at, id);
    return result.changes > 0;
  }
}

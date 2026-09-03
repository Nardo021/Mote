import { Permission, isPermission } from "../auth/permissions.js";
import type { MoteDatabase } from "../storage/database.js";
import { nowMs } from "../utils/time.js";
import type { ApiTokenRecord, ApiTokenRow } from "./tokenTypes.js";

function mapTokenRow(row: ApiTokenRow): ApiTokenRecord {
  if (!isPermission(row.permission)) {
    throw new Error(`Invalid stored permission: ${row.permission}`);
  }
  return {
    id: row.id,
    name: row.name,
    tokenHash: row.token_hash,
    permission: row.permission,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

export class TokenRepository {
  constructor(private readonly db: MoteDatabase) {}

  insert(record: ApiTokenRecord): void {
    this.db
      .prepare(
        `INSERT INTO api_tokens (id, name, token_hash, permission, enabled, created_at, last_used_at)
         VALUES (@id, @name, @token_hash, @permission, @enabled, @created_at, @last_used_at)`,
      )
      .run({
        id: record.id,
        name: record.name,
        token_hash: record.tokenHash,
        permission: record.permission,
        enabled: record.enabled ? 1 : 0,
        created_at: record.createdAt,
        last_used_at: record.lastUsedAt,
      });
  }

  findById(id: string): ApiTokenRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT id, name, token_hash, permission, enabled, created_at, last_used_at
         FROM api_tokens WHERE id = ?`,
      )
      .get(id) as ApiTokenRow | undefined;
    return row ? mapTokenRow(row) : undefined;
  }

  findByTokenHash(tokenHash: string): ApiTokenRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT id, name, token_hash, permission, enabled, created_at, last_used_at
         FROM api_tokens WHERE token_hash = ?`,
      )
      .get(tokenHash) as ApiTokenRow | undefined;
    return row ? mapTokenRow(row) : undefined;
  }

  list(): ApiTokenRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, token_hash, permission, enabled, created_at, last_used_at
         FROM api_tokens ORDER BY created_at ASC`,
      )
      .all() as ApiTokenRow[];
    return rows.map(mapTokenRow);
  }

  setEnabled(id: string, enabled: boolean): boolean {
    const result = this.db
      .prepare("UPDATE api_tokens SET enabled = ? WHERE id = ?")
      .run(enabled ? 1 : 0, id);
    return result.changes > 0;
  }

  updateTokenHash(id: string, tokenHash: string): boolean {
    const result = this.db
      .prepare("UPDATE api_tokens SET token_hash = ?, last_used_at = NULL WHERE id = ?")
      .run(tokenHash, id);
    return result.changes > 0;
  }

  updateLastUsed(id: string, lastUsedAt: number = nowMs()): boolean {
    const result = this.db.prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ?").run(lastUsedAt, id);
    return result.changes > 0;
  }
}

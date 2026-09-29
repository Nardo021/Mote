import { isUuid } from "../utils/ids.js";
import { nowMs } from "../utils/time.js";
import type { MoteDatabase } from "./sql.js";

export type Migration = {
  id: number;
  sql: string;
  after?: (db: MoteDatabase) => void;
};

export const MIGRATIONS: readonly Migration[] = [
  {
    id: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        credential_hash TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_seen_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS api_tokens (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        permission TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
        created_at INTEGER NOT NULL,
        last_used_at INTEGER
      );
    `,
  },
  {
    id: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS admins (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_login_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS admin_sessions (
        id TEXT PRIMARY KEY,
        admin_id TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS command_events (
        id TEXT PRIMARY KEY,
        command_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        action TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('shortcut', 'dashboard', 'ios')),
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        sent_at INTEGER,
        completed_at INTEGER,
        duration_ms INTEGER,
        error_code TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_admin_sessions_token_hash ON admin_sessions (token_hash);
      CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions (expires_at);
      CREATE INDEX IF NOT EXISTS idx_command_events_created_at ON command_events (created_at);
      CREATE INDEX IF NOT EXISTS idx_command_events_device_id ON command_events (device_id);
      CREATE INDEX IF NOT EXISTS idx_command_events_status ON command_events (status);
    `,
  },
  {
    id: 3,
    sql: `
      ALTER TABLE devices ADD COLUMN app_version TEXT;
    `,
  },
  {
    id: 4,
    sql: `
      CREATE TABLE IF NOT EXISTS pair_requests (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        device_name TEXT NOT NULL,
        pair_secret_hash TEXT NOT NULL,
        status TEXT NOT NULL CHECK (
          status IN ('pending', 'approved', 'rejected', 'cancelled', 'expired')
        ),
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_pair_requests_device_id
        ON pair_requests (device_id);
      CREATE INDEX IF NOT EXISTS idx_pair_requests_status_expires
        ON pair_requests (status, expires_at);
    `,
  },
  {
    id: 5,
    sql: `
      ALTER TABLE devices ADD COLUMN platform TEXT;
      ALTER TABLE devices ADD COLUMN actions TEXT;
      ALTER TABLE api_tokens ADD COLUMN client_kind TEXT NOT NULL DEFAULT 'shortcut';
      ALTER TABLE api_tokens ADD COLUMN device_ids TEXT;
    `,
  },
  {
    id: 6,
    sql: `
      ALTER TABLE api_tokens ADD COLUMN device_id TEXT;
    `,
    after: bindTokenDeviceScope,
  },
  {
    id: 7,
    sql: `
      CREATE TABLE command_events_v7 (
        id TEXT PRIMARY KEY,
        command_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        action TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('shortcut', 'dashboard')),
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        sent_at INTEGER,
        completed_at INTEGER,
        duration_ms INTEGER,
        error_code TEXT
      );

      INSERT INTO command_events_v7 (
        id, command_id, device_id, action, source, status,
        created_at, sent_at, completed_at, duration_ms, error_code
      )
      SELECT
        id, command_id, device_id, action,
        CASE WHEN source = 'ios' THEN 'shortcut' ELSE source END,
        status, created_at, sent_at, completed_at, duration_ms, error_code
      FROM command_events;

      DROP TABLE command_events;
      ALTER TABLE command_events_v7 RENAME TO command_events;

      CREATE INDEX IF NOT EXISTS idx_command_events_created_at
        ON command_events (created_at);
      CREATE INDEX IF NOT EXISTS idx_command_events_device_id
        ON command_events (device_id);
      CREATE INDEX IF NOT EXISTS idx_command_events_status
        ON command_events (status);

      UPDATE api_tokens SET client_kind = 'shortcut' WHERE client_kind = 'ios';
    `,
  },
];

function soleLegacyDeviceId(raw: string | null): string | null {
  if (raw === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 1 || typeof parsed[0] !== "string") {
    return null;
  }
  return isUuid(parsed[0]) ? parsed[0] : null;
}

function bindTokenDeviceScope(db: MoteDatabase): void {
  const rows = db.prepare("SELECT id, device_ids FROM api_tokens").all() as Array<{
    id: string;
    device_ids: string | null;
  }>;
  const keep = db.prepare("UPDATE api_tokens SET device_id = ? WHERE id = ?");
  const disable = db.prepare("UPDATE api_tokens SET enabled = 0, device_id = NULL WHERE id = ?");
  for (const row of rows) {
    const deviceId = soleLegacyDeviceId(row.device_ids);
    if (deviceId === null) {
      disable.run(row.id);
      continue;
    }
    keep.run(deviceId, row.id);
  }
}

function ensureMigrationsTable(db: MoteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);
}

export function appliedMigrationIds(db: MoteDatabase): Set<number> {
  ensureMigrationsTable(db);
  const rows = db
    .prepare("SELECT id FROM schema_migrations ORDER BY id")
    .all() as Array<{ id: number }>;
  return new Set(rows.map((row) => row.id));
}

export function migrate(db: MoteDatabase): number {
  ensureMigrationsTable(db);
  const applied = appliedMigrationIds(db);
  const insert = db.prepare(
    "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
  );
  let count = 0;
  const apply = db.transaction(() => {
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.id)) {
        continue;
      }
      db.exec(migration.sql);
      migration.after?.(db);
      insert.run(migration.id, nowMs());
      count += 1;
    }
  });
  apply();
  return count;
}

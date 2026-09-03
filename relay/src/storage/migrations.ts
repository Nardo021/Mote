import type { Database } from "better-sqlite3";

import { nowMs } from "../utils/time.js";

export type Migration = {
  id: number;
  sql: string;
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
];

function ensureMigrationsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);
}

export function appliedMigrationIds(db: Database): Set<number> {
  ensureMigrationsTable(db);
  const rows = db
    .prepare("SELECT id FROM schema_migrations ORDER BY id")
    .all() as Array<{ id: number }>;
  return new Set(rows.map((row) => row.id));
}

export function migrate(db: Database): number {
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
      insert.run(migration.id, nowMs());
      count += 1;
    }
  });
  apply();
  return count;
}

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
  const rows = db.prepare("SELECT id FROM schema_migrations ORDER BY id").all() as Array<{ id: number }>;
  return new Set(rows.map((row) => row.id));
}

export function migrate(db: Database): number {
  ensureMigrationsTable(db);
  const applied = appliedMigrationIds(db);
  const insert = db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)");
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

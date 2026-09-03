import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

import { migrate } from "./migrations.js";

export type MoteDatabase = Database.Database;

export function applyPragmas(db: MoteDatabase): void {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
}

export function openDatabase(databasePath: string): MoteDatabase {
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  applyPragmas(db);
  migrate(db);
  return db;
}

export function openMemoryDatabase(): MoteDatabase {
  const db = new Database(":memory:");
  applyPragmas(db);
  migrate(db);
  return db;
}

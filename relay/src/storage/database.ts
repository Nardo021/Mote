import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";

import { migrate } from "./migrations.js";
import type { MoteDatabase } from "./sql.js";
import {
  openSqlStorageDatabase,
  type SqlCursor,
  type SqlStorageLike,
} from "./sqlStorage.js";

export type { MoteDatabase } from "./sql.js";

class MemorySqlStorage implements SqlStorageLike {
  constructor(private readonly db: DatabaseSync) {}

  exec(query: string, ...bindings: unknown[]): SqlCursor {
    const statement = this.db.prepare(query);
    if (returnsRows(query)) {
      const rows = readRows(statement, bindings);
      return {
        toArray: () => rows,
        rowsWritten: 0,
      };
    }
    const result = runStatement(statement, bindings);
    return {
      toArray: () => [],
      rowsWritten: Number(result.changes),
    };
  }
}

function returnsRows(query: string): boolean {
  const trimmed = query.trim();
  if (/^pragma\b/i.test(trimmed) && trimmed.includes("=")) {
    return false;
  }
  return /^(select|pragma|with|explain)\b/i.test(trimmed);
}

function sqlInputs(bindings: unknown[]): SQLInputValue[] {
  return bindings as SQLInputValue[];
}

function plainRows(rows: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => ({ ...row }));
}

function readRows(
  statement: StatementSync,
  bindings: unknown[],
): Record<string, unknown>[] {
  const inputs = sqlInputs(bindings);
  const rows =
    inputs.length === 0
      ? statement.all()
      : statement.all(...inputs);
  return plainRows(rows as Record<string, unknown>[]);
}

function runStatement(statement: StatementSync, bindings: unknown[]) {
  const inputs = sqlInputs(bindings);
  if (inputs.length === 0) {
    return statement.run();
  }
  return statement.run(...inputs);
}

function transactionSync<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // The original error is the one callers need.
    }
    throw error;
  }
}

function openNodeMemoryDatabase(applyMigrations: boolean): MoteDatabase {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const adapted = openSqlStorageDatabase(
    new MemorySqlStorage(raw),
    (fn) => transactionSync(raw, fn),
  );
  if (applyMigrations) {
    migrate(adapted);
  }
  return {
    prepare: (sql) => adapted.prepare(sql),
    exec: (sql) => adapted.exec(sql),
    transaction: (fn) => adapted.transaction(fn),
    close: () => {
      raw.close();
    },
  };
}

export function openMemoryDatabase(): MoteDatabase {
  return openNodeMemoryDatabase(true);
}

export function openRawMemoryDatabase(): MoteDatabase {
  return openNodeMemoryDatabase(false);
}

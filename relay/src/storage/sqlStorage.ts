import type { MoteDatabase, SqlStatement } from "./sql.js";

export type SqlCursor = {
  toArray(): Record<string, unknown>[];
  readonly rowsWritten: number;
};

export type SqlStorageLike = {
  exec(query: string, ...bindings: unknown[]): SqlCursor;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function bindSql(
  sql: string,
  params: unknown[],
): { sql: string; values: unknown[] } {
  const named = params.length === 1 ? params[0] : undefined;
  if (!isPlainObject(named) || !/[@:$][A-Za-z_]/.test(sql)) {
    return { sql, values: params };
  }
  const record = named;
  const values: unknown[] = [];
  const rewritten = sql.replaceAll(
    /[@:$]([A-Za-z_][A-Za-z0-9_]*)/g,
    (_match, name: string) => {
      if (!Object.hasOwn(record, name)) {
        throw new Error(`SQL binding @${name} is missing.`);
      }
      values.push(record[name]);
      return "?";
    },
  );
  return { sql: rewritten, values };
}

export function splitSql(sql: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index] ?? "";
    if (quote !== null) {
      current += char;
      if (char === quote) {
        const next = sql[index + 1];
        if (next === quote) {
          current += next;
          index += 1;
          continue;
        }
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === "-" && sql[index + 1] === "-") {
      const lineEnd = sql.indexOf("\n", index);
      if (lineEnd === -1) {
        break;
      }
      index = lineEnd;
      current += "\n";
      continue;
    }
    if (char === ";") {
      const statement = current.trim();
      if (statement !== "") {
        parts.push(statement);
      }
      current = "";
      continue;
    }
    current += char;
  }
  const tail = current.trim();
  if (tail !== "") {
    parts.push(tail);
  }
  return parts;
}

class StorageStatement implements SqlStatement {
  constructor(
    private readonly storage: SqlStorageLike,
    private readonly sql: string,
  ) {}

  get(...params: unknown[]): unknown {
    const bound = bindSql(this.sql, params);
    const rows = this.storage.exec(bound.sql, ...bound.values).toArray();
    return rows[0];
  }

  all(...params: unknown[]): unknown[] {
    const bound = bindSql(this.sql, params);
    return this.storage.exec(bound.sql, ...bound.values).toArray();
  }

  run(...params: unknown[]): { changes: number } {
    const bound = bindSql(this.sql, params);
    const cursor = this.storage.exec(bound.sql, ...bound.values);
    return { changes: cursor.rowsWritten };
  }
}

export function openSqlStorageDatabase(
  storage: SqlStorageLike,
  transactionSync: <T>(fn: () => T) => T,
): MoteDatabase {
  try {
    storage.exec("PRAGMA foreign_keys = ON");
  } catch {
    // Durable Object SQLite already enforces the statements it supports.
  }
  return {
    prepare(sql: string): SqlStatement {
      return new StorageStatement(storage, sql);
    },
    exec(sql: string): void {
      for (const statement of splitSql(sql)) {
        storage.exec(statement);
      }
    },
    transaction<T>(fn: () => T): () => T {
      return () => transactionSync(fn);
    },
    close(): void {
      // Durable Object storage stays open for the lifetime of the object.
    },
  };
}

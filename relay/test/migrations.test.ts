import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { openMemoryDatabase } from "../src/storage/database.js";
import { appliedMigrationIds, migrate } from "../src/storage/migrations.js";

describe("database migration", () => {
  it("creates the devices and api_tokens tables", () => {
    const db = openMemoryDatabase();
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    const names = tables.map((row) => row.name);
    assert.ok(names.includes("devices"));
    assert.ok(names.includes("api_tokens"));
    assert.ok(names.includes("admins"));
    assert.ok(names.includes("admin_sessions"));
    assert.ok(names.includes("command_events"));
    assert.ok(names.includes("schema_migrations"));
    db.close();
  });

  it("adds a nullable app_version column to devices", () => {
    const db = openMemoryDatabase();
    const columns = db.prepare("PRAGMA table_info(devices)").all() as Array<{
      name: string;
      notnull: number;
    }>;
    const appVersion = columns.find((column) => column.name === "app_version");
    assert.ok(appVersion);
    assert.equal(appVersion.notnull, 0);

    db.prepare(
      `INSERT INTO devices (id, name, credential_hash, enabled, created_at, updated_at, last_seen_at)
       VALUES ('dev-2', 'Mac', 'hash', 1, 1, 1, NULL)`,
    ).run();
    const row = db
      .prepare("SELECT app_version FROM devices WHERE id = 'dev-2'")
      .get() as { app_version: string | null };
    assert.equal(row.app_version, null);
    db.close();
  });

  it("is idempotent and does not destroy existing rows", () => {
    const db = openMemoryDatabase();
    db.prepare(
      `INSERT INTO devices (id, name, credential_hash, enabled, created_at, updated_at, last_seen_at)
       VALUES ('dev-1', 'Mac', 'hash', 1, 1, 1, NULL)`,
    ).run();
    const appliedBefore = appliedMigrationIds(db);
    const second = migrate(db);
    assert.equal(second, 0);
    assert.deepEqual(appliedMigrationIds(db), appliedBefore);
    const row = db
      .prepare("SELECT name FROM devices WHERE id = 'dev-1'")
      .get() as { name: string };
    assert.equal(row.name, "Mac");
    db.close();
  });
});

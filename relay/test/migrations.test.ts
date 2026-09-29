import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { openMemoryDatabase, openRawMemoryDatabase } from "../src/storage/database.js";
import { appliedMigrationIds, MIGRATIONS, migrate } from "../src/storage/migrations.js";

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
    assert.ok(names.includes("pair_requests"));
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

  it("disables legacy unscoped tokens and keeps a single-device token", () => {
    const db = openRawMemoryDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `);
    const recordMigration = db.prepare(
      "INSERT INTO schema_migrations (id, applied_at) VALUES (?, 1)",
    );
    for (const migration of MIGRATIONS) {
      if (migration.id >= 6) {
        break;
      }
      db.exec(migration.sql);
      recordMigration.run(migration.id);
    }
    const insert = db.prepare(
      `INSERT INTO api_tokens (
         id, name, token_hash, permission, client_kind, device_ids, enabled, created_at
       ) VALUES (?, ?, ?, 'send_command', 'shortcut', ?, 1, 1)`,
    );
    const scoped = "11111111-1111-4111-8111-111111111111";
    const other = "22222222-2222-4222-8222-222222222222";
    insert.run("global", "Global", "hash-global", null);
    insert.run("one", "One", "hash-one", JSON.stringify([scoped]));
    insert.run("many", "Many", "hash-many", JSON.stringify([scoped, other]));
    insert.run("bad", "Bad", "hash-bad", JSON.stringify(["not-a-uuid"]));

    assert.equal(migrate(db), 2);

    const rows = db
      .prepare("SELECT id, device_id, enabled FROM api_tokens ORDER BY id")
      .all() as Array<{ id: string; device_id: string | null; enabled: number }>;
    const byId = new Map(rows.map((row) => [row.id, row]));
    assert.deepEqual(byId.get("global"), { id: "global", device_id: null, enabled: 0 });
    assert.deepEqual(byId.get("one"), { id: "one", device_id: scoped, enabled: 1 });
    assert.deepEqual(byId.get("many"), { id: "many", device_id: null, enabled: 0 });
    assert.deepEqual(byId.get("bad"), { id: "bad", device_id: null, enabled: 0 });
    db.close();
  });

  it("maps historical ios activity and tokens onto shortcut", () => {
    const db = openRawMemoryDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `);
    const recordMigration = db.prepare(
      "INSERT INTO schema_migrations (id, applied_at) VALUES (?, 1)",
    );
    for (const migration of MIGRATIONS) {
      if (migration.id >= 7) {
        break;
      }
      db.exec(migration.sql);
      migration.after?.(db);
      recordMigration.run(migration.id);
    }
    const deviceId = "11111111-1111-4111-8111-111111111111";
    db.prepare(
      `INSERT INTO command_events (
         id, command_id, device_id, action, source, status, created_at
       ) VALUES ('ios-event', 'cmd-ios', ?, 'lock', 'ios', 'completed', 1)`,
    ).run(deviceId);
    db.prepare(
      `INSERT INTO command_events (
         id, command_id, device_id, action, source, status, created_at
       ) VALUES ('dash-event', 'cmd-dash', ?, 'lock', 'dashboard', 'completed', 2)`,
    ).run(deviceId);
    db.prepare(
      `INSERT INTO api_tokens (
         id, name, token_hash, permission, enabled, created_at, client_kind, device_id
       ) VALUES ('ios-token', 'Phone', 'hash-ios', 'send_command', 1, 1, 'ios', ?)`,
    ).run(deviceId);

    assert.equal(migrate(db), 1);

    const events = db
      .prepare("SELECT id, source FROM command_events ORDER BY id")
      .all() as Array<{ id: string; source: string }>;
    assert.deepEqual(events, [
      { id: "dash-event", source: "dashboard" },
      { id: "ios-event", source: "shortcut" },
    ]);
    const token = db
      .prepare("SELECT client_kind, enabled FROM api_tokens WHERE id = 'ios-token'")
      .get() as { client_kind: string; enabled: number };
    assert.deepEqual(token, { client_kind: "shortcut", enabled: 1 });
    assert.throws(() => {
      db.prepare(
        `INSERT INTO command_events (
           id, command_id, device_id, action, source, status, created_at
         ) VALUES ('again', 'cmd', ?, 'lock', 'ios', 'completed', 3)`,
      ).run(deviceId);
    });
    db.close();
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const schema = readFileSync(
  new URL("../../cloud/migrations/0001_core.sql", import.meta.url),
  "utf8",
);

const accountId = "11111111-1111-4111-8111-111111111111";
const otherAccountId = "22222222-2222-4222-8222-222222222222";
const deviceId = "44444444-4444-4444-8444-444444444444";
const shaA = "a".repeat(64);
const shaB = "b".repeat(64);
const shaC = "c".repeat(64);

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(schema);
  db.prepare(
    "INSERT INTO cloud_accounts(id, apple_subject, created_at_ms) VALUES(?, ?, ?)",
  ).run(accountId, "apple-a", 1_000);
  db.prepare(
    "INSERT INTO cloud_accounts(id, apple_subject, created_at_ms) VALUES(?, ?, ?)",
  ).run(otherAccountId, "apple-b", 1_000);
  return db;
}

test("hosted D1 schema is valid SQLite and enforces Apple identity uniqueness", () => {
  const db = database();
  try {
    assert.throws(() => {
      db.prepare(
        "INSERT INTO cloud_accounts(id, apple_subject, created_at_ms) VALUES(?, ?, ?)",
      ).run("88888888-8888-4888-8888-888888888888", "apple-a", 1_000);
    });
  } finally {
    db.close();
  }
});

test("device ownership and credential hashes enforce foreign keys and uniqueness", () => {
  const db = database();
  try {
    const insert = db.prepare(
      `INSERT INTO cloud_devices
        (id, owner_account_id, name, platform, credential_hash, created_at_ms, updated_at_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    assert.throws(() =>
      insert.run(deviceId, "missing-account", "PC", "windows", shaA, 1_000, 1_000),
    );
    insert.run(deviceId, accountId, "PC", "windows", shaA, 1_000, 1_000);
    assert.throws(() =>
      insert.run("55555555-5555-4555-8555-555555555555", otherAccountId, "Mac", "macos", shaA, 1_000, 1_000),
    );
    assert.throws(() =>
      insert.run("55555555-5555-4555-8555-555555555555", otherAccountId, "Mac", "linux", shaB, 1_000, 1_000),
    );
    assert.equal(
      (db.prepare("SELECT owner_account_id FROM cloud_devices WHERE id = ?").get(deviceId) as { owner_account_id: string }).owner_account_id,
      accountId,
    );
  } finally {
    db.close();
  }
});

test("session refresh digests are unique and deletions revoke sessions", () => {
  const db = database();
  try {
    const insert = db.prepare(
      `INSERT INTO cloud_sessions
        (id, account_id, refresh_token_hash, created_at_ms, expires_at_ms)
        VALUES (?, ?, ?, ?, ?)`,
    );
    insert.run("s1", accountId, shaA, 1_000, 20_000);
    assert.throws(() => insert.run("s2", otherAccountId, shaA, 1_000, 20_000));
    assert.throws(() => insert.run("s3", otherAccountId, "short", 1_000, 20_000));
    db.prepare("DELETE FROM cloud_accounts WHERE id = ?").run(accountId);
    assert.equal(
      (db.prepare("SELECT count(*) AS n FROM cloud_sessions").get() as { n: number }).n,
      0,
    );
  } finally {
    db.close();
  }
});

test("only one pending ticket exists per device and approval requires a known account", () => {
  const db = database();
  try {
    const insert = db.prepare(
      `INSERT INTO cloud_pairing_tickets
        (id, device_id, device_name, device_platform, claim_secret_hash,
         poll_secret_hash, device_credential_hash, created_at_ms, expires_at_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insert.run("ticket1", deviceId, "My PC", "windows", shaA, shaB, shaC, 1_000, 20_000);
    assert.throws(() =>
      insert.run("ticket2", deviceId, "My PC", "windows", shaB, shaA, shaC, 1_000, 20_000),
    );
    assert.throws(() =>
      db.prepare(
        "UPDATE cloud_pairing_tickets SET status = 'approved' WHERE id = 'ticket1'",
      ).run(),
    );
    db.prepare(
      "UPDATE cloud_pairing_tickets SET status = 'approved', claimed_by_account_id = ? WHERE id = ?",
    ).run(accountId, "ticket1");
    insert.run("ticket2", deviceId, "My PC", "windows", shaB, shaA, shaC, 1_000, 20_000);
    db.prepare("DELETE FROM cloud_accounts WHERE id = ?").run(accountId);
    assert.equal(
      (db.prepare("SELECT count(*) AS n FROM cloud_pairing_tickets WHERE id = 'ticket1'").get() as { n: number }).n,
      0,
    );
    assert.equal(
      (db.prepare("SELECT count(*) AS n FROM cloud_pairing_tickets WHERE id = 'ticket2'").get() as { n: number }).n,
      1,
    );
  } finally {
    db.close();
  }
});

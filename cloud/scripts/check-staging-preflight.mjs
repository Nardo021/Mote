#!/usr/bin/env node
/**
 * Mote Cloud staging preflight: read-only unless --render is explicitly used.
 *
 * Examples:
 *   node cloud/scripts/check-staging-preflight.mjs
 *   node cloud/scripts/check-staging-preflight.mjs --verify-remote
 *   node cloud/scripts/check-staging-preflight.mjs --verify-remote --render
 *
 * Never puts API tokens or staging gate secrets into a Wrangler config.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const templatePath = join(root, "cloud", "wrangler.staging.example.jsonc");
const outPath = join(root, "cloud", "wrangler.staging.jsonc");
const expectedFiles = ["0001_core.sql", "0002_auth.sql", "0003_pairing_claim.sql"];
const args = new Set(process.argv.slice(2));
const allowed = new Set(["--verify-remote", "--render"]);
const requiredTables = [
  "cloud_accounts", "cloud_sessions", "cloud_devices",
  "cloud_pairing_tickets", "cloud_auth_challenges",
];
const requiredIndexes = [
  "idx_cloud_sessions_account", "idx_cloud_sessions_expires",
  "idx_cloud_devices_owner_status", "idx_cloud_pairing_one_pending_device",
  "idx_cloud_pairing_expiry", "idx_cloud_sessions_access_token_hash",
  "idx_cloud_sessions_refresh_token_hash", "idx_cloud_auth_challenges_expiry",
];
const requiredTriggers = [
  "cloud_pairing_only_active_account", "cloud_pairing_approve_create_device",
  "cloud_pairing_prevent_approved_reuse",
];
function exactSet(actual, expected, label) {
  const sort = items => [...items].sort();
  assert.deepEqual(sort(actual), sort(expected), label);
}
function fail(reason) {
  // Do not log credential values, raw Cloudflare responses or sensitive env.
  console.error(`MOTE_STAGING_PREFLIGHT_BLOCKED: ${reason}`);
  process.exitCode = 1;
}
function validUUID(value) {
  return typeof value === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
}
function templateCheck() {
  assert.equal(args.size, [...args].filter(a => allowed.has(a)).length, "Unknown arguments");
  const cfg = JSON.parse(readFileSync(templatePath, "utf8"));
  assert.equal(cfg.name, "mote-cloud-staging");
  assert.equal(cfg.main, "../relay/src/cloud/cloudWorker.ts");
  assert.equal(cfg.workers_dev, false, "Staging MUST NOT be routable by default");
  assert.ok(!cfg.routes && !cfg.route && !cfg.triggers, "No public routes or schedules");
  assert.equal(cfg.vars?.MOTE_CLOUD_STAGING_ENABLED, "false", "Staging must default OFF");
  assert.equal(cfg.vars?.APPLE_CLIENT_ID, "REPLACE_WITH_REAL_IOS_BUNDLE_ID");
  assert.ok(!JSON.stringify(cfg).includes("MOTE_CLOUD_STAGING_GATE"));
  assert.ok(!JSON.stringify(cfg).includes("MOTE_CLOUD_INTERNAL_SECRET"));
  assert.equal(cfg.d1_databases?.length, 1);
  const db = cfg.d1_databases[0];
  assert.equal(db.binding, "CLOUD_DB");
  assert.equal(db.database_name, "mote-cloud-staging");
  assert.equal(db.database_id, "REPLACE_WITH_NEW_STAGING_D1_ID");
  assert.equal(db.migrations_table, "d1_migrations");
  assert.equal(db.migrations_dir, "migrations");
  assert.equal(cfg.durable_objects?.bindings?.length, 1);
  assert.equal(cfg.durable_objects.bindings[0].name, "CLOUD_TENANTS");
  assert.equal(cfg.durable_objects.bindings[0].class_name, "MoteCloudTenant");
  assert.equal(cfg.migrations?.[0]?.new_sqlite_classes?.[0], "MoteCloudTenant");
  assert.equal(cfg.migrations?.length, 1);
  exactSet(
    expectedFiles.filter(file => existsSync(join(root, "cloud", "migrations", file))),
    expectedFiles,
    "Missing source migration file",
  );
  return cfg;
}
async function remoteCheck() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.MOTE_CLOUD_STAGING_DB_ID;
  if (!token || !/^[a-f0-9]{32}$/i.test(account ?? "") ||
      !validUUID(databaseId) ||
      process.env.MOTE_STAGING_D1_CONFIRM !== "mote-cloud-staging") {
    throw new Error("Remote checks require token, account/DB IDs and exact staging confirmation");
  }
  const base = `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${databaseId}`;
  async function api(suffix, method = "GET", body) {
    const response = await fetch(base + suffix, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(12_000),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success || (Array.isArray(payload.result) &&
        payload.result.some(result => !result.success))) {
      throw new Error("Cloudflare staging read-only query failed");
    }
    return payload.result;
  }
  const database = await api("");
  assert.equal(database.name, "mote-cloud-staging");
  const sql = `SELECT type,name FROM sqlite_master
    WHERE name LIKE 'cloud_%' OR name LIKE 'idx_cloud_%'
       OR name='d1_migrations' ORDER BY type,name`;
  const objects = (await api("/query", "POST", { sql }))[0].results;
  exactSet(objects.filter(o => o.type === "table" && o.name !== "d1_migrations").map(o => o.name),
    requiredTables, "Staging database tables drifted");
  exactSet(objects.filter(o => o.type === "index").map(o => o.name),
    requiredIndexes, "Staging indexes drifted");
  exactSet(objects.filter(o => o.type === "trigger").map(o => o.name),
    requiredTriggers, "Staging triggers drifted");
  assert.ok(objects.some(o => o.name === "d1_migrations" && o.type === "table"));
  const sessionCols = (await api("/query", "POST", {
    sql: "PRAGMA table_info(cloud_sessions)",
  }))[0].results.map(row => row.name);
  for (const column of [
    "id", "account_id", "refresh_token_hash", "access_token_hash",
    "expires_at_ms", "access_expires_at_ms", "revoked_at_ms",
  ]) assert.ok(sessionCols.includes(column), "Session schema missing mandatory field");

  const claimCols = (await api("/query", "POST", {
    sql: "PRAGMA table_info(cloud_pairing_tickets)",
  }))[0].results.map(row => row.name);
  for (const column of [
    "id", "device_id", "claim_secret_hash", "poll_secret_hash",
    "device_credential_hash", "status", "claimed_by_account_id",
  ]) assert.ok(claimCols.includes(column), "Pairing schema missing mandatory field");

  const triggerBody = (await api("/query", "POST", {
    sql: "SELECT sql FROM sqlite_master WHERE type='trigger' AND name='cloud_pairing_approve_create_device'",
  }))[0].results[0]?.sql ?? "";
  assert.match(triggerBody, /AFTER\\s+UPDATE\\s+OF\\s+status/i);
  assert.match(triggerBody, /INSERT\\s+INTO\\s+cloud_devices/i);
  const uniquePending = (await api("/query", "POST", {
    sql: "SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_cloud_pairing_one_pending_device'",
  }))[0].results[0]?.sql ?? "";
  assert.match(uniquePending, /CREATE\\s+UNIQUE\\s+INDEX/i);
  assert.match(uniquePending, /WHERE\\s+status\\s*=\\s*'pending'/i);
  const ledger = (await api("/query", "POST", {
    sql: "SELECT name FROM d1_migrations ORDER BY id",
  }))[0].results;
  exactSet(ledger.map(row => row.name), expectedFiles, "Migration ledger has unexpected entries");
  return databaseId;
}
async function main() {
  const cfg = templateCheck();
  if (args.has("--render") && !args.has("--verify-remote")) {
    throw new Error("--render requires an actual remote D1 verification");
  }
  if (args.has("--verify-remote")) await remoteCheck();
  if (args.has("--render")) {
    const id = process.env.MOTE_CLOUD_STAGING_DB_ID;
    const audience = process.env.APPLE_CLIENT_ID;
    if (!validUUID(id) || !/^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z][A-Za-z0-9-]*){2,}$/.test(audience ?? "") ||
        audience?.includes("example") || audience?.includes("REPLACE") ||
        audience?.includes("testing")) {
      throw new Error("A real iOS Apple Bundle ID must be provided");
    }
    if (existsSync(outPath)) throw new Error("Refusing to overwrite existing staging config");
    cfg.d1_databases[0].database_id = id;
    cfg.vars.APPLE_CLIENT_ID = audience;
    // Never enable the app or workers.dev in the rendered configuration.
    assert.equal(cfg.vars.MOTE_CLOUD_STAGING_ENABLED, "false");
    assert.equal(cfg.workers_dev, false);
    writeFileSync(outPath, JSON.stringify(cfg, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log("MOTE_STAGING_PREFLIGHT_PASS: isolated disabled config generated");
  } else {
    console.log("MOTE_STAGING_PREFLIGHT_PASS: offline config safe" +
      (args.has("--verify-remote") ? "; D1 schema/ledger verified" : ""));
  }
}
main().catch(error => fail(error instanceof Error ? error.message : "unknown error"));

#!/usr/bin/env node
/**
 * Live Cloudflare D1 staging contract check, opt-in only.
 *
 * Requires CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID,
 * MOTE_CLOUD_STAGING_DB_ID, and MOTE_STAGING_D1_CONFIRM=mote-cloud-staging.
 * Never targets another database name and always deletes test fixture rows.
 *
 * This does NOT deploy a Worker, test real WebSockets or use Apple tokens.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const dbId = process.env.MOTE_CLOUD_STAGING_DB_ID;
const confirmation = process.env.MOTE_STAGING_D1_CONFIRM;
if (!token || !/^[a-f0-9]{32}$/i.test(account ?? "") ||
    !/^[a-f0-9-]{36}$/i.test(dbId ?? "") ||
    confirmation !== "mote-cloud-staging") {
  console.error("BLOCKED: missing staging-only Cloudflare credentials, IDs or confirmation.");
  process.exit(2);
}

const base = `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${dbId}`;
async function api(path, method = "GET", body) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json();
  if (!response.ok || payload.success !== true ||
      (Array.isArray(payload.result) && payload.result.some(r => r.success === false))) {
    const error = new Error(`D1 query failed (HTTP ${response.status})`);
    error.httpStatus = response.status;
    error.details = payload.errors?.map(e => String(e.message ?? "")).join("; ") ?? "";
    throw error;
  }
  return payload.result;
}
async function q(sql, params = []) {
  return (await api("/query", "POST", { sql, params }))[0];
}

const accountA = randomUUID();
const accountB = randomUUID();
const ticketA = randomUUID();
const ticketB = randomUUID();
const deviceA = randomUUID();
const deviceB = randomUUID();
const now = Date.now();
const expiry = now + 300_000;
const accounts = [accountA, accountB];
const tickets = [ticketA, ticketB];
const hash = value => value.repeat(64);

async function main() {
  const database = await api();
  assert.equal(database.name, "mote-cloud-staging", "Refuse any non-staging D1 database");

  const objects = await q(
    "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'cloud_pairing_%'",
  );
  assert.equal(objects.results.length, 3, "Required atomic pairing triggers missing");

  const result = {};
  try {
    for (const [id, suffix] of [[accountA, "a"], [accountB, "b"]]) {
      await q(
        "INSERT INTO cloud_accounts (id,apple_subject,created_at_ms) VALUES (?,?,?)",
        [id, `staging-fixture-${ticketA}-${suffix}`, String(now)],
      );
    }
    const insertTicket = async (id, device, claimHash, pollHash, credentialHash) => {
      await q(
        `INSERT INTO cloud_pairing_tickets
         (id,device_id,device_name,device_platform,claim_secret_hash,poll_secret_hash,
          device_credential_hash,status,created_at_ms,expires_at_ms)
         VALUES (?,?, 'P0C3 Fixture','windows',?,?,?,'pending',?,?)`,
        [id, device, claimHash, pollHash, credentialHash, String(now), String(expiry)],
      );
    };
    const approve = (id, owner) => q(
      `UPDATE cloud_pairing_tickets
       SET status='approved', claimed_by_account_id=?
       WHERE id=? AND status='pending' AND expires_at_ms>?`,
      [owner, id, String(now)],
    );

    await insertTicket(ticketA, deviceA, hash("a"), hash("b"), hash("c"));
    const races = await Promise.allSettled([
      approve(ticketA, accountA), approve(ticketA, accountB),
    ]);
    const winning = races.filter(x => x.status === "fulfilled" &&
      Number(x.value.meta?.changes) > 0);
    assert.equal(winning.length, 1, "Exactly one approval must commit");

    const ownerRow = await q(
      "SELECT owner_account_id FROM cloud_devices WHERE id=?", [deviceA],
    );
    assert.equal(ownerRow.results.length, 1);
    const owner = ownerRow.results[0].owner_account_id;
    assert.ok(accounts.includes(owner));
    result.triggerInclusiveChanges = winning[0].value.meta.changes;
    result.exactlyOneWinner = true;

    const replay = await approve(ticketA, owner === accountA ? accountB : accountA);
    assert.equal(replay.meta.changes, 0, "Ticket must not transfer ownership");
    result.replayRejected = true;

    await insertTicket(ticketB, deviceB, hash("d"), hash("e"), hash("c"));
    let collisionRejected = false;
    try {
      await approve(ticketB, accountB);
    } catch (error) {
      collisionRejected = error.httpStatus === 400;
    }
    assert.equal(collisionRejected, true, "Duplicate credential must abort");
    const pending = await q(
      "SELECT status FROM cloud_pairing_tickets WHERE id=?", [ticketB],
    );
    assert.equal(pending.results[0]?.status, "pending",
      "Trigger failure must roll back ticket approval");
    const devices = await q(
      "SELECT COUNT(*) AS n FROM cloud_devices WHERE id IN (?,?)",
      [deviceA, deviceB],
    );
    assert.equal(devices.results[0]?.n, 1);
    result.collisionRollback = true;
    console.log(JSON.stringify({ status: "D1_STAGING_PASS", ...result }));
  } finally {
    // Pending tickets are not owned by an account and must be removed
    // separately. Use exact unique fixture IDs, never a broad DELETE.
    try {
      for (const id of tickets) {
        await q("DELETE FROM cloud_pairing_tickets WHERE id=?", [id]);
      }
      for (const id of accounts) {
        await q("DELETE FROM cloud_accounts WHERE id=?", [id]);
      }
      const remaining = await q(
        `SELECT
         (SELECT COUNT(*) FROM cloud_pairing_tickets WHERE id IN (?,?)) AS tickets,
         (SELECT COUNT(*) FROM cloud_accounts WHERE id IN (?,?)) AS accounts,
         (SELECT COUNT(*) FROM cloud_devices WHERE id IN (?,?)) AS devices`,
        [...tickets, ...accounts, deviceA, deviceB],
      );
      assert.deepEqual(remaining.results[0], { tickets: 0, accounts: 0, devices: 0 });
    } catch (error) {
      console.error("CLEANUP_FAILED: synthetic fixture rows require manual review.");
      throw error;
    }
  }
}
main().catch(error => {
  console.error(`D1_STAGING_FAIL: ${error.message}`);
  process.exitCode = 1;
});

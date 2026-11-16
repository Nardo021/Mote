# Mote Cloud P0C3A — Real Cloudflare D1 staging migration and pairing verification

**Date:** 2026-11-17 (Australia/Sydney)  
**Phase:** P0C3A D1 REAL_STAGING_PARTIAL; Cloud Worker, Apple, WSS, mobile and desktop hardware are **NOT DEPLOYED/VERIFIED**.  
**Parent:** P0C2 Draft PR #5. This change is intended as a stacked Draft PR.

## Verified actions

In the connected Cloudflare account, a **new and separate** D1 database named
`mote-cloud-staging` was created in the APAC region on 2026-11-16 UTC.
Existing databases and the older `mote-rc` Worker were inspected and not changed.

All three source-controlled migrations were applied **directly through the
Cloudflare D1 REST query API**, in this order:

1. `cloud/migrations/0001_core.sql` — 9 statements succeeded.
2. `cloud/migrations/0002_auth.sql` — 6 statements succeeded.
3. `cloud/migrations/0003_pairing_claim.sql` — 3 triggers succeeded.

A subsequent remote `sqlite_master` query verified 5 Cloud tables and all 3
`cloud_pairing_*` triggers were present.

A disposable **two-account D1 fixture** then tested:

- Concurrent approvals of one pending ticket: winner `meta.changes = 2` and
  loser `meta.changes = 0`; only one account-owned device was created.
- Replay by the other account: no additional change.
- A second ticket attempting to register the same credential hash: the trigger
  caused a constraint rejection; the ticket stayed pending and no second device
  was inserted.
- Fixture cleanup: confirmed **0 test accounts, 0 devices, 0 tickets** remained
  after removing pending tickets explicitly.

**Important real-D1 discovery:** D1's `meta.changes` counts the pairing ticket
UPDATE **plus** the trigger's device INSERT (2). The previous Node SQLite
adapter observed 1, so `CloudPairingRepository.approve` incorrectly checked
`changes === 1` and would return failure *after a successful committed claim*.
This PR fixes the result check to `Number.isSafeInteger(changes) && changes > 0`
for an UPDATE constrained to a unique ticket ID, and adds a regression test
that simulates the real D1 trigger-inclusive change count.

## Rerunnable verification

Use the opt-in `cloud/scripts/verify-staging-d1.mjs` script. It has an
**unskippable database-name guard** and creates only random synthetic fixture
rows, all cleaned up in `finally`.

Operator credentials must be exported as environment variables, **never
committed to Git or Notion**:

```sh
export CLOUDFLARE_API_TOKEN='(supply locally)'
export CLOUDFLARE_ACCOUNT_ID='(your Cloudflare account ID)'
export MOTE_CLOUD_STAGING_DB_ID='(verified staging D1 UUID)'
export MOTE_STAGING_D1_CONFIRM='mote-cloud-staging'
node cloud/scripts/verify-staging-d1.mjs
```

The script should report `D1_STAGING_PASS` with a single owner, replay
denial and collision rollback. Missing environment variables block it.
It never deploys a Worker, changes production tables, calls Apple, or locks a
desktop. Do not use database IDs from unrelated projects.

## Important migration tracking note

The above schema was installed via **direct D1 REST API statements**, NOT
`wrangler d1 migrations apply --remote`. This does **not** establish a
Wrangler-managed migration history. **Do not rerun** the three SQL files via
Wrangler against the populated `mote-cloud-staging` database: `CREATE TABLE`
and `CREATE TRIGGER` statements are not idempotent and will conflict.

Before adopting Wrangler as the ongoing migration runner, explicitly
**reconcile a reviewed migration baseline** with actual live `sqlite_master`
and Wrangler's documented migration tracking. Never insert fictional migration
records, reset the database, or run a destructive restore without review. Future
migration scripts must be independently versioned and verified.

## What is NOT verified (release blockers)

- No hosted Cloud Worker and no per-account Durable Object has been deployed.
  The separate staging template still has placeholder IDs/client identifier and
  `MOTE_CLOUD_STAGING_ENABLED=false`.
- No server-held staging gate or internal DO secret was configured; they must
  not be placed in a public iOS/desktop app.
- No authentic Sign in with Apple token, iOS login flow or device QR UI was
  tested.
- No real Cloudflare Worker/Durable Object WebSocket upgrade, hibernation,
  command dispatch or physical macOS/Windows lock has been tested.
- No immediate device-revocation socket close, account deletion, distributed
  throttling/cost controls, verified signing or App Store readiness.

## Next release-safe step

After reviewing the P0C2 security model, provide **operator-only** Cloud
staging credentials and real Apple client identifier, configure the isolated
Worker with the verified D1 binding and `CLOUD_TENANTS` (no old personal
Relay), and run a real Staging Worker/DO end-to-end test. Keep staging
**disabled/gated** until genuine Apple auth, revocation, two-account isolation
and physical device tests pass. The user-facing no-setup experience remains a
later P1–P3 deliverable.

References: [P0C2 realtime](cloud-p0c2-realtime.md),
[P0C1 atomic pairing](cloud-p0c1-pairing.md),
[Cloudflare D1 REST query API](https://developers.cloudflare.com/d1/best-practices/query-d1/).

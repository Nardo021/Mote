# Mote Cloud P0C3B — Staging Migration Baseline and Fail-Closed Deployment Gate

**Recorded:** 2026-11-17 (Australia/Sydney)  
**Status:** D1 ledger reconciled on actual Cloudflare staging; deploy preflight implemented. **Cloud Worker/DO NOT DEPLOYED.**  
**Parent:** P0C3A Draft PR #6. This phase must remain stacked, Draft and not public-ready.

## Verified Cloudflare operations

Connected Cloudflare account: `Leo`. Dedicated database:
`mote-cloud-staging` (`3ac5c176-9975-433a-992f-411245118d91`).

The three schema migrations in this repository had already been executed successfully
**against this staging D1 database** using the D1 REST API in P0C3A. Prior
to reconciliation there were 5 application tables, 8 named indexes and 3
triggers. Session columns added by migration 0002 were also present. The
database contained no real or synthetic accounts, devices or pairing tickets.

Wrangler's expected ledger table did **not** yet exist, because the SQL
had not been run through `wrangler d1 migrations apply --remote`. Based on
the source-controlled SQL already executed and the Cloudflare Wrangler
migration helper schema, a ledger table was created with the official form:

```sql
CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
```

Only the **previously applied**, verified migrations were recorded:

- `0001_core.sql`
- `0002_auth.sql`
- `0003_pairing_claim.sql`

A follow-up **real D1 read** confirmed all three rows. This is
reconciliation of known execution evidence, **not an assertion that Wrangler
executed those statements**. It must not be repeated for another database
without first checking that database's actual schema and history. No
unrelated Cloudflare Workers, databases or DNS were changed.

Sources:
[Cloudflare's current D1 migration documentation](https://developers.cloudflare.com/d1/reference/migrations/)
and the [Wrangler migration table helper](https://github.com/cloudflare/workers-sdk/blob/main/packages/wrangler/src/d1/migrations/helpers.ts).

## Runtime compatibility discovered by CI

The initial local-workerd smoke job failed even though the Cloud Worker
bundle compiled: Wrangler 4.137.0's pinned workerd binary supports a latest
compatibility date of `2026-09-28`, while the new Cloud configs specified
`2026-11-16`. The **Cloud-only** CI and staging configuration now use the
same supported date `2026-09-28` to test actual local runtime behavior.
This changes neither the existing personal Relay config nor its code.
Before raising the Cloud compatibility date, upgrade Wrangler/workerd in
a separate reviewed dependency update and repeat the local and real
staging acceptance tests.

## Source changes in this PR

1. `cloud/wrangler.staging.example.jsonc` now has
   `workers_dev: false`, **no routes**, `MOTE_CLOUD_STAGING_ENABLED=false`,
   and an explicit `migrations_table: "d1_migrations"`. It still carries
   placeholder IDs, and **never** contains a private gate or DO secret.
2. `cloud/scripts/check-staging-preflight.mjs` verifies that the template
   names ONLY the new Cloud Worker, D1 and tenant DO, stays disabled and
   unroutable, and includes the three existing SQL migration files.
3. In opt-in `--verify-remote` mode, the checker demands a verified
   `mote-cloud-staging` database name and exact migration ledger, then
   checks all 5 tables, 8 named indexes, 3 triggers, critical session/pairing
   columns and the trigger's atomic INSERT behavior from `sqlite_master`.
   It makes **read-only** Cloudflare REST requests, and requires the operator's
   API token in their own environment.
4. `--render` requires that remote verification passed and a **real,
   non-placeholder Apple Bundle ID** was supplied through the operator's
   environment. It writes the explicitly disabled local config only once to
   `cloud/wrangler.staging.jsonc`, which is gitignored. It **does not
   deploy**, activate, publish a route or generate/store any secret.
5. CI executes the offline config checks, syntax-checks the verifier and
   builds the Cloud Worker by Wrangler dry-run. It also starts the local
   workerd runtime and asserts unauthenticated health/devices/pairings traffic
   stays HTTP 503 when the staging flag is off. No Cloudflare account access
   or secrets are required in CI.

## Safe operator-only workflow (NOT executed by this PR)

From the repository checkout with Node 22 and the current Wrangler dependency:

```sh
npm ci
npm ci --prefix relay

# Offline guard: does not use Cloudflare credentials.
node cloud/scripts/check-staging-preflight.mjs

# Operator supplies these outside source control.
export CLOUDFLARE_API_TOKEN='(set locally; never commit)'
export CLOUDFLARE_ACCOUNT_ID='(real Cloudflare account ID)'
export MOTE_CLOUD_STAGING_DB_ID='(verified Mote Cloud Staging D1 UUID)'
export MOTE_STAGING_D1_CONFIRM='mote-cloud-staging'

# READ-ONLY on Cloudflare. Verifies migration history & schema.
node cloud/scripts/check-staging-preflight.mjs --verify-remote

# Only once the genuine Apple iOS Bundle ID is known and verified:
export APPLE_CLIENT_ID='(real iOS Bundle ID)'
node cloud/scripts/check-staging-preflight.mjs --verify-remote --render

# An operator may inspect the generated disabled config:
npx wrangler d1 migrations list mote-cloud-staging \
  --config cloud/wrangler.staging.jsonc --remote
npx wrangler deploy --config cloud/wrangler.staging.jsonc --dry-run
```

**Do not run** `d1 migrations apply --remote` as a speculative bootstrap
step. The existing database has a verified schema and a recorded baseline.
For future migrations, review the list and new SQL files, obtain a D1
backup/bookmark and make a separate migration PR.

Only after explicit review of the generated disabled configuration, signed
Apple identity flow, tenant DO runtime, logging, abuse controls and deployment
target may an operator deploy a **non-routed, disabled** staging Worker.
Both `MOTE_CLOUD_STAGING_GATE` and `MOTE_CLOUD_INTERNAL_SECRET` must be
configured as **separate Cloudflare secret bindings**, never as `vars` or
in released clients. Do not enable `workers_dev`, routes or
`MOTE_CLOUD_STAGING_ENABLED` before additional security review.

## Exit gates before real multi-account hardware tests

- [x] Real D1 tables, indexes and SQLite triggers observed on staging.
- [x] Real D1 atomic double-claim, replay and collision-rollback tested (P0C3A).
- [x] Manually applied past migrations reconciled with a real three-row
      Wrangler-format ledger; reading it back succeeded.
- [ ] New Cloud **runtime** deployed in the dedicated account without
      accidentally updating the personal `mote-rc` Worker.
- [ ] Real Apple iOS Bundle ID and Sign in with Apple token tested against
      the new staging service.
- [ ] Private staging gate/internal DO secret provisioned by the operator;
      no secrets are committed to GitHub/Notion or bundled in clients.
- [ ] Real Cloudflare Durable Object WebSocket/auth/command/hibernation and
      revocation results verified, not merely compiled.
- [ ] Full iPhone → Cloud → Windows/macOS lock tested on real hardware.
- [ ] Public abuse/rate limits, account deletion, telemetry/privacy,
      signed installers, Self-host docs and App Store requirements addressed.

**Do not confuse a successful CLI dry-run, a disabled local workerd smoke
test or D1 REST schema verification with a deployed multi-tenant service.**

Also see [P0C3A live D1 record](cloud-p0c3a-real-d1.md) and
[P0C2 WebSocket design](cloud-p0c2-realtime.md).

# Mote Cloud P0B — Staging authentication and D1 ownership API

**Date:** 2026-11-16  
**Status:** SOURCE IMPLEMENTED; CI and staging deployment evidence must be checked separately.  
**Branch:** `feature/mote-cloud-p0b-auth-20261116`, stacked on `feature/mote-cloud-p0a-20261116` / Draft PR #2.

## What this slice adds

A separate staging-only Worker entrypoint, **not a change to the existing self-hosted Worker**:

- `relay/src/cloud/stagingWorker.ts` — gated HTTP API; never forwarded by `relay/src/worker/index.ts`.
- `relay/src/cloud/appleIdentity.ts` — Apple identity token JWS signature verification using the **fixed** Apple signing-keys URL, RS256 JWKS key ID and server-stored challenge nonce, plus issuer, exact configured audience, issuance and expiry validation. The verified `sub` is used as identity, **never email**. Apple currently publishes RSA/RS256 keys at `https://appleid.apple.com/auth/keys`.
- `relay/src/cloud/identityRepository.ts` — D1 read/write operations for one-time sign-in challenges, Apple-subject account lookup/creation, 15-minute opaque access tokens, 30-day refresh sessions, single-winner refresh rotation and revocation; device queries always filter by verified account ID.
- `cloud/migrations/0002_auth.sql` — adds access-token digest and one-time nonce challenge table to the *new, separate* hosted D1 database.
- `relay/test/cloudAppleIdentity.test.ts`, `relay/test/cloudStaging.test.ts` — local synthetic-JWT, SQLite and HTTP-handler tests. No real Apple identity, live Cloudflare traffic or desktop lock is simulated or claimed.
- `cloud/wrangler.ci.jsonc` — fail-closed **dry-run bundle only**. Root CI separately builds this new Worker with `--dry-run` and never deploys it.
- `cloud/wrangler.staging.example.jsonc` — disabled-by-default deploy template with unfilled Apple Bundle ID and isolated D1 ID.

## Staging API (all routes require a private staging gate)

| Method | Route | Purpose | State |
|---|---|---|---|
| GET | `/cloud/v1/health` | Staging health | Implemented, gated |
| POST | `/cloud/v1/auth/challenge` | Create random nonce, store SHA-256 digest | Implemented, gated |
| POST | `/cloud/v1/auth/apple` | Verify Apple JWT and atomic challenge use; create/get account, issue session | Implemented, gated |
| POST | `/cloud/v1/session/refresh` | Rotate refresh and access tokens; old credentials fail | Implemented, gated |
| POST | `/cloud/v1/session/logout` | Revoke current session | Implemented, gated |
| GET | `/cloud/v1/me` | Display authenticated account ID | Implemented, gated |
| GET | `/cloud/v1/devices` | List only the signed-in account's active devices | Implemented, gated |
| ALL | `/cloud/v1/pairings/*`, `/cloud/v1/ws/*`, commands, deletion | No public device control yet | **404 / NOT IMPLEMENTED** |

**First-run authentication:** client calls challenge endpoint, sends returned `nonce` as the Apple request nonce in a real `ASAuthorizationAppleIDRequest`, receives Apple identity token, then sends `identityToken` + `challengeId` to the exchange endpoint. Backend reads expected nonce hash from D1; refuses token mismatch; consumes nonce through `UPDATE ... WHERE used_at_ms IS NULL AND expires_at_ms > now` and requires exactly one changed row. It creates a Mote account for Apple's stable subject and returns random access + refresh session tokens. The app will store tokens in iOS Keychain; never send them through URL query strings.

**Environment guard:** requests are rejected unless `MOTE_CLOUD_STAGING_ENABLED=true`, `APPLE_CLIENT_ID` is configured, `CLOUD_DB` is bound, and a non-empty private `MOTE_CLOUD_STAGING_GATE` of at least 32 characters is supplied in `X-Mote-Staging-Gate`. This gate is ONLY for internal staging and must **never** be embedded in a distributed iOS/desktop app. Native users will use the eventual public API after abuse limiting and secure end-to-end pairing exist.

## Configuration and activation procedure (NOT EXECUTED)

No live D1 database was created or modified in this PR. To set up a **future isolated staging sandbox**, a human operator must first review the test and security evidence and then:

1. Create a **new** Cloudflare D1 database specifically for Mote Cloud Staging, not the personal/self-host DO. Record its actual ID using the provider's tool. Validate the database is not referenced by other Workers.
2. Copy `cloud/wrangler.staging.example.jsonc` to `cloud/wrangler.staging.jsonc` (a local, intentionally untracked operator file). Replace `REPLACE_WITH_NEW_STAGING_D1_ID` with the verified database ID; replace `APPLE_CLIENT_ID` with the actual signed iOS app's Bundle ID. Keep `MOTE_CLOUD_STAGING_ENABLED=false` during initial setup.
3. Review and apply `0001_core.sql`, then `0002_auth.sql` **only to the new staging database** via Wrangler D1 migrations with an explicit `--config cloud/wrangler.staging.jsonc` and `--remote`, after reviewing migration target and backup/rollback. Never use the root `wrangler.jsonc` or the `mote` DO as migration target.
4. Configure a high-entropy private `MOTE_CLOUD_STAGING_GATE` as a **secret**, not a file or public Worker var. Test the default disabled mode and missing/wrong-gate refusal before enabling the explicit staging flag.
5. Gate test traffic to a small authorized internal team. Verify with an actual Apple-signed native token, then run rotation, replay and account A/B negative tests against the real staging D1 and Worker. Keep logs free of credentials.
6. If any test fails, set `MOTE_CLOUD_STAGING_ENABLED=false` and investigate; no DNS/public launch follows from this stage.

**Caution:** The template uses placeholder database ID and Bundle ID; it is intentionally not deployable without operator configuration. Nothing here implies Apple Developer credentials have been created or that a public URL is live.

## Security caveats / next required work

- **No public registration:** the unauthenticated challenge endpoint is **not** yet safe against distributed abuse at internet scale. The staging gate is a temporary internal control, not something to ship. Before removing it, add edge-level rate limiting, request budgets/abuse detection and validated session issuance load tests.
- **Apple token assurance:** tests validate locally signed synthetic tokens against locally generated JWKS. Real Apple server integration and Apple authorization code exchange / Apple refresh-token account standing checks must be reviewed before public launch. If Apple's active ID-token signature algorithm or key shape changes, update the strict verifier only with authoritative evidence and tests.
- **No device pairing or locking:** P0A's ownership policy and P0B's D1 device queries exist, but no Cloud WebSocket, pairing, command dispatch, account deletion, revocation broadcast or device key enrollment have been implemented. Existing `/v1/*` personal relay remains isolated.
- **No customer app:** native iOS, default Cloud desktop bootstrap and account deletion UI are separate P1–P3 slices.
- **Operational safety:** real D1 schema/migration tests, failure-injection, quota enforcement, 24-hour soak and observability are still blockers. For production, assess session token theft/reuse detection and robust refresh-token family revocation. Current rotation rejects the old token, but does not yet detect prior token theft using token family history.
- **Access token policy:** opaque random 256-bit tokens, SHA-256 hashes at rest, 15-minute access life, 30-day non-sliding refresh session lifetime. Logout revokes the current session. No raw credentials in the database or activity logs.
- **Endpoint DNS:** no production/staging domain committed; do not embed a guessed base URL in signed clients.

### Validation commands

```sh
npm ci
npm ci --prefix relay
npm test --prefix relay
npm run typecheck --prefix relay
npx wrangler deploy --config cloud/wrangler.ci.jsonc --dry-run --outdir dist/cloud
```

CI should execute these through existing Relay/Protocol and new staging dry-run jobs. A passing bundle **does not** prove a live deploy, a genuine Apple token, Cloudflare D1 semantics under contention, or App Store readiness.

## Next implementation (P0C)

1. Add **real D1 transactional one-time pairing claims**, separate desktop polling proof and authenticated per-account WebSocket tenant isolation.
2. Add two-account **end-to-end** negative authorization tests under real staging, alongside appropriate rate limiting and device credential revocation.
3. Only then implement signed desktop Cloud-first pairing and iOS screens against the public-ready API. Keep self-hosting as an independent Advanced profile.

[GitHub P0A security contract](cloud-p0a-security.md) · [Public product roadmap (Draft PR #1)](https://github.com/Nardo021/Mote/pull/1).

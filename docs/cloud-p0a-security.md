# Mote Cloud P0A — Account ownership and pairing security contract

**Status: PARTIAL / SOURCE ONLY**  
2026-11-16 — branch `feature/mote-cloud-p0a-20261116`, based on `mote-v2`.

This document describes the security boundary for the planned public zero-configuration Mote Cloud. **No hosted API, public registration, Apple token verification, Durable Object tenant routing, database migration, or deployment is activated by this PR.** The existing single-operator Worker, self-host pairing and Protocol v1 are unchanged.

## Completed scope in this PR

- `relay/src/cloud/authorization.ts` defines a fail-closed `lock` policy that evaluates a **trusted, already verified** hosted session and an **authoritative D1 owned-device row**. It returns the database-derived `tenantAccountId` routing key only for an active owned device.
- `relay/test/cloudAuthorization.test.ts` checks owner, missing/foreign/revoked device indistinguishability, session expiry/revocation/disabled state, target mismatch and rejection of all actions except `lock`.
- `cloud/migrations/0001_core.sql` defines a **separate future hosted D1 database** with Apple identity subjects, refresh sessions, per-device owner/credential hashes and short-lived pairing tickets. It must never be applied to the existing personal Durable Object storage.
- `relay/test/cloudSchema.test.ts` exercises the schema using built-in SQLite, including uniqueness, foreign keys, one outstanding pairing ticket per device and account-deletion cascades. This is not a substitute for a real D1 staging migration test.

## Trust boundaries

1. The account/session passed to `authorizeCloudLock` must originate from an actual **server-verified Sign in with Apple identity** and a currently live D1 session. The interface alone is **not an authentication mechanism**. Never construct a session from request JSON, a query parameter, a self-asserted user ID or an unverified JWT.
2. Resolve the target device by ID from D1 on every command. Permission checks must verify *owner account ID*, *active account/session*, *active device* and *action allowlist* BEFORE accessing the account's Durable Object. Cross-account, non-existent and revoked-device requests must have indistinguishable 404 responses.
3. Use the **D1 device row's owner ID**, not a caller-controlled account query or an unverified JWT claim, as the Durable Object key. On WebSocket authentication repeat credential, device state, ownership and tenant checks. On command response, bind the response to the original authenticated device socket and command ID.
4. A session's expiry is insufficient for revocation. The D1 session must be checked for revocation and account status at every sensitive operation. On account deletion, revoke device credentials and close connected sockets; failing closed is preferable to a stale allowed command.
5. Only `lock` is permitted. Maintain Protocol v1's command TTL (10 seconds by default), replay protections, no offline command queue, and no arbitrary scripts or remote unlock.
6. Errors must not include foreign device name, owner account, platform, presence or timestamps.

## Proposed hosted API contracts (not implemented)

All APIs below are **future Cloud-only** endpoints; the existing self-host `/v1/*` API stays as-is.

| Method / route | Caller | Essential checks |
|---|---|---|
| `POST /cloud/v1/auth/apple` | iOS | Verify Apple JWT signature, issuer/audience/nonce and expiry; create or locate account |
| `POST /cloud/v1/session/refresh` | iOS | Verify and rotate hashed refresh session; prevent replay |
| `GET /cloud/v1/devices` | iOS | Return only devices owned by session account |
| `POST /cloud/v1/pairings` | Desktop | Enforce rate limits, random hashes, expiry and device ID uniqueness |
| `POST /cloud/v1/pairings/:id/approve` | iOS | Validate session, one-time QR claim proof, matching code, not expired; atomic claim |
| `GET /cloud/v1/pairings/:id` | Desktop | Authenticate **separate polling proof**; never return device secret |
| `POST /cloud/v1/devices/:id/commands` | iOS | Authorize requested lock against DB ownership before routing to owner's DO |
| `DELETE /cloud/v1/devices/:id` | iOS | Owner-only revoke and live socket disconnect |
| `DELETE /cloud/v1/account` | iOS | Revoke all sessions/devices, invalidate DO connections, complete deletion process |

Consider a separate `/cloud/v1/ws/device` for hosted agents; reuse the **Protocol v1 frame format**, not the self-host credential store. Disable every Cloud route unless full auth and tenant routing is active. A future staging Worker must use isolated bindings/secrets and must not expose the legacy `idFromName("mote")` DO.

## Zero-config pairing protocol proposal

This protocol is **not implemented**; its state transitions and concurrency require live integration tests.

1. A new Mac/Windows agent chooses Mote Cloud by default from signed application configuration; it generates a persistent UUID, a 256-bit device credential and a different random polling proof on the device. It sends only secure digests and a name/platform to the rate-limited Cloud pairing endpoint.
2. The server creates a fresh random short-lived QR claim secret and ticket. D1 holds only the `claim_secret_hash`, `poll_secret_hash` and `device_credential_hash`, never plaintext device keys. The returned QR encodes the one-time ticket ID and claim secret, **not** a permanent device credential. Desktop retains its private proofs.
3. The already signed-in iOS App scans the QR, fetches a constrained device name and platform, and displays a matching code/confirmation step. The logged-in user explicitly approves. The server checks ticket digest, expiry, pending state and session validity.
4. Approval is **atomic**: claim ticket exactly once and register the device with the account and its committed device credential digest in one D1 transaction. Replayed/expired QR, duplicate device ID and concurrent competing claims all fail closed. Cloudflare documents D1 `batch()` as transactional, but implement only after validating the exact SQL and zero-matched-row behavior.
5. Desktop polls with its separate secret, sees confirmation and begins the existing authenticated Protocol v1 device WebSocket against the account-authorized Cloud service. The server never transports the plaintext device credential to iPhone or another machine.
6. If the device has no approval by expiry, show **Try again** and generate a new challenge. Already registered device IDs cannot be silently re-paired; removal or explicit credential rotation requires owner action.

### Explicit abuse and failure cases to test in P0B

- Two accounts attempt to claim the same ticket concurrently: **only one owned device**, one durable owner.
- A replayed QR/ticket cannot attach a second device or change ownership.
- A claimed ticket's polling proof cannot be replaced with another desktop's proof.
- A stolen refresh credential cannot keep working after rotation; access tokens expire and session revocation is honored.
- Unknown/foreign/revoked device IDs are indistinguishable to the requester.
- A device disconnect/DO eviction cannot cause a pending lock to execute late.
- Deleting an account and revoking a device must invalidate open WebSockets, not just D1 rows.
- Rate limits cover unauthenticated pairing, QR approval and account bootstrap separately. No unbounded unauthenticated write path.
- Secrets, full Apple ID tokens, one-time pairing proofs and device identifiers should be redacted from application event logs.

## Why this is deliberately not yet the full Cloud implementation

The `mote-v2` app is a **personal single-Durable-Object Relay**. Adding an `account_id` field to its own database or changing `idFromName("mote")` to a user-controlled key would be insecure. Before exposing any hosted endpoint, implement:

- A **new** Worker deployment and D1 binding with replayable staged migrations and rollback plan.
- Apple's signed identity verification, session storage/rotation/revocation, and account deletion lifecycle.
- Real D1 atomic pairing and comprehensive two-account adversarial E2E tests.
- Per-account DO isolation and fresh ownership checks on both command dispatch and device socket admission.
- Bounded work/cost limits, visibility of errors, recovery from DO hibernation/eviction and resource billing tests.

## CI and validation

From a normal checkout of this branch:

```bash
npm ci
npm ci --prefix relay
npm test --prefix relay
npm run typecheck --prefix relay
npm run worker:dry-run
```

The Relay test glob automatically includes `cloudAuthorization.test.ts` and `cloudSchema.test.ts`. Those test files do **not** contact Cloudflare, lock a desktop or deploy a Worker.

**Unverified until CI:** tests and typecheck must pass in an actual GitHub Actions run. **Not claimed:** D1 staging, Sign in with Apple, live desktop pairing, real iOS, tenant isolation across DOs, App Store readiness.

## Next narrow PR (P0B)

Implement staged Cloud-only identity/session verification and the D1 ownership repository behind a separate Worker configuration. Add two-account integration tests. Keep public route exposure disabled until P0C pairing and tenant-isolated DO routing tests pass. Align iOS Cloud-first UI with the hosted API contract, while maintaining the advanced self-host UI as a distinct credential profile.

Source of truth: [Mote public launch roadmap](public-launch-roadmap.md). See the existing [self-host security document](security.md) for Protocol v1 and personal Relay credential roles.

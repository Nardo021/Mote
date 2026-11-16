# Mote Cloud P0C1 — Atomic QR pairing and tenant admission

**Date:** 2026-11-16  
**Status:** staging-only source + synthetic tests. **No live Cloudflare D1, real desktop WebSocket, remote lock or iOS implementation has been validated.**
**Parent:** P0B Draft PR #3, which builds on P0A Draft PR #2. Do not merge this stacked branch independently of its parents.

## Implemented in this PR

- `cloud/migrations/0003_pairing_claim.sql`: **SQLite trigger** inserts an account-owned device in the **same SQL UPDATE** that marks a pending pairing ticket approved. A uniqueness/foreign-key failure aborts the entire statement. Second approval cannot transfer ownership; approved status cannot be reverted.
- `relay/src/cloud/pairingRepository.ts`: generates an opaque random short-lived claim secret; uses the existing P0A schema to store only SHA-256 digests of the claim, desktop polling proof and device credential. Returns a 6-digit visual verification code derived from the QR claim. The code is a display check, **not** an authentication factor.
- Staging-only `/cloud/v1/pairings` create endpoint, `/preview` and `/approve` endpoints requiring a verified iOS account/session, and `/status` endpoint requiring the **separate desktop polling proof**. All requests still require the private test gate from P0B.
- `relay/src/cloud/tenantAdmission.ts`: D1 verified device credential/owner lookup for future WebSocket admission and composition with P0A owner-only `lock` policy. Only the database-derived account ID is eligible as a DO key. **This is NOT a working DO server or public command endpoint.**
- Offline HTTP+SQLite tests for single-use QR, account race, expired claims, invalid proof, duplicate device credentials, 6-digit confirmation, cross-account invisibility and owner-derived route selection. **No device is actually locked in the tests.**

## Staging-only pairing flow

1. Desktop creates a 256-bit device credential **and independent 256-bit polling secret** locally; only their SHA-256 hex digests leave the desktop for `POST /cloud/v1/pairings`. Client also submits a newly generated UUID, display name and `macos|windows`.
2. Server inserts pending ticket (5-minute expiry), generates a 256-bit claim secret and returns `ticketId`, `claimSecret`, `verificationCode` and `expiresAtMs`. The desktop shows this ticket/claim secret as a QR code and the verificationCode as six digits. **Never encode the desktop credential or polling secret in the QR.** The QR's secret must not enter URL query parameters, logs, analytics or history.
3. iOS is already signed in. It scans QR, sends `claimSecret` in the JSON body to `POST /cloud/v1/pairings/:ticketId/preview` with its account access token; displays the **server-returned** device name/platform and code. User confirms the code matches the desktop screen.
4. iOS POSTs to `/approve` with bearer access token plus JSON `{claimSecret, confirmedCode}`. SQL UPDATE is constrained on ticket ID, digest, pending status, expiry, active account and absence of existing device. The trigger creates the device row in **that same statement**. A second approving account or replay cannot claim it.
5. Desktop POSTs to `/status` using `{pollSecret}` in JSON (not query parameters). It learns only `pending|approved|expired|rejected`; its secret device credential was always retained locally. On approval the desktop may begin connecting to a **future** device WebSocket endpoint that has not yet been implemented.
6. The same signed-in iOS account can see its approved device in `GET /cloud/v1/devices`; another account sees nothing. Existing P0A owner-only lock authorization remains a separate function, with **no remotely executable command endpoint** yet.

## HTTP routes (all protected by the internal staging gate)

| Method/route | Caller | Auth | Result |
|---|---|---|---|
| `POST /cloud/v1/pairings` | Desktop | staging gate (test-only) | New one-time ticket or 409 |
| `POST /cloud/v1/pairings/:id/preview` | iOS | access session + claim secret | Name/platform/code or 404 |
| `POST /cloud/v1/pairings/:id/approve` | iOS | access session + claim secret + confirmed code | Atomic approval, 409/404 failure |
| `POST /cloud/v1/pairings/:id/status` | Desktop | separate polling secret | Non-secret status or 404 |
| `POST /cloud/v1/devices/:id/commands` | iOS | N/A | NOT IMPLEMENTED / 404 |
| `/cloud/v1/ws/device` | Desktop | N/A | NOT IMPLEMENTED / 404 |

**Important:** The internal staging gate is not a customer authentication system; **never ship it in iOS/desktop apps.** Device creation is untrusted while this gate is the sole admission control; before public launch implement per-IP/device/global rate limits, abuse protection, transport integrity, trusted client onboarding and backend budget controls.

## Atomic claim correctness

- Trigger attaches device registration to the same database update so a successful approval cannot be committed without inserting the device, and a failed insert rolls back approval. The ticket stays `pending` on a duplicate credential.
- Approved tickets are immutable, and the partial unique index permits only one outstanding pending ticket per device ID. A new attempt is allowed after expiry, but only when the device ID is not already registered.
- The claimed device's *owner* comes from a **verified account session** used for the update. The credential was generated and retained by the desktop; the D1 credential hash alone must not enable impersonation.
- The 6-digit code checks that both UIs display the same challenge. Since the full QR claim secret can derive that code, it does not protect against a malicious QR that the user voluntarily scans; require clear device name/platform and explicit physical user confirmation.

## Tenant routing boundary (policy only)

The next Cloud WS entrypoint must route by looking up device ownership in D1. Device Protocol v1 starts by sending an `auth` frame containing device UUID and credential. A future WebSocket handler **cannot safely route or deliver commands based on a caller-supplied account ID**; it must authenticate the credential and bind the socket to a D1-verified owner, then revalidate on reconnect/revocation/DO restart.

`authorizeCloudDeviceAdmission` verifies the credential hash and both active device and active account. `authorizeCloudCommandAdmission` validates the signed-in phone session and that device ownership/action are permitted. The resulting `cloudTenantObjectKey` can be derived only from a server-verified admission. These functions do not create or connect a DO, and **no real WebSocket/remote lock feature can be claimed yet**.

**Protocol v1 compatibility:** no change to existing personal Relay, no arbitrary action, no offline queue, no remote unlock. Keep existing `command`, `auth`, `heartbeat` and `command_result` frames when implementing tenant DO connectivity.

## Test and release gates

GitHub CI should run the new `relay/test/cloudStaging.test.ts` integration tests (Node SQLite) as part of `Relay / Protocol`; the existing Cloud Staging Worker dry-run job verifies it bundles but **does not deploy**. In all cases verify the actual workflow results before claiming PASS.

**Still blocked:** creation/approval on real D1, trigger compatibility on actual Cloudflare deployment, Sign in with Apple on a genuine device, billing/abuse controls, actual tenant DO routing and hibernating WSS, device credential revocation and live disconnect, expiry/heartbeat/replay behavior under DO restart, desktop installer onboarding, native iOS and real OS lock, account deletion, signed binaries and App Store publication.

## Next: P0C2

Implement a distinct Cloudflare-hosted **per-account** Durable Object class and WSS admission protocol with tenant binding and D1 credential check, then a verified command dispatch with correct ownership and 10-second TTL / response correlation. Require two-account adversarial tests, revoked socket test, replay detection, offline no-queue test, DO hibernation/restart test and actual cloud-staging integration. The personal single-operator Durable Object and self-host Dashboard must stay untouched.

Sources: [P0A security plan](cloud-p0a-security.md) and [P0B identity stage](cloud-p0b-identity.md). Cloudflare D1: https://developers.cloudflare.com/d1/worker-api/d1-database/ .

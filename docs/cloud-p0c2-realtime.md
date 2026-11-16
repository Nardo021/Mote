# Mote Cloud P0C2 — Tenant WebSocket and online-only lock dispatch

**Stage:** P0C2 Draft / staging-only source; 2026-11-16  
**Based on:** P0C1 PR #4 (which depends on P0B #3 and P0A #2)  
**Release posture:** production BLOCKED; no live Cloudflare D1, genuine Apple login, desktop/iOS Cloud app or real device lock has been verified.

## Implemented code scope

- `relay/src/cloud/realtimeCore.ts`: separate tenant-owned Protocol v1 realtime engine. Authenticates the existing desktop `auth` frame via server-side D1 credential and account ownership; handles heartbeats, correlated `command_result` responses, single-in-flight `lock` per device, 10-second command expiry, request timeout and offline failures. Never persists or queues a command for later reconnection.
- `relay/src/cloud/tenantDurableObject.ts`: new Cloud-only `MoteCloudTenant` Durable Object with hibernating WebSockets, persistent tenant binding, per-socket ordered message handling, D1 checks on events and command admission, and stale socket alarm. It does **not** use the personal `MoteRelay` DO.
- `relay/src/cloud/cloudWorker.ts`: exports the hosted Worker handler and separate DO class. Node offline tests still import only `stagingWorker.ts`, avoiding `cloudflare:workers` module loading.
- `relay/src/cloud/stagingWorker.ts`: stages `GET /cloud/v1/ws/device/:deviceId` and `POST /cloud/v1/devices/:deviceId/commands`. Both are behind the **existing private staging gate**, not public API. All tenant IDs come from D1; user-supplied account/owner headers are stripped and overwritten before forwarding.
- `cloud/wrangler.ci.jsonc` and `cloud/wrangler.staging.example.jsonc`: new isolated `CLOUD_TENANTS` DO binding and **cloud-v1** SQLite class migration. CI only performs `wrangler deploy --dry-run`, never deployment. The operator's D1 ID and real Apple Bundle ID remain placeholders, and the staging flag remains false.
- `relay/test/cloudRealtime.test.ts`: offline SQLite/Protocol v1 tests, plus fake DO namespace routing. These do not prove Cloudflare's actual WebSocket runtime semantics.

## Full request trust boundary

### Device WebSocket

1. A desktop already paired through P0C1 has a UUID and a locally retained random 256-bit device credential.
2. It opens `wss://<future-stage-domain>/cloud/v1/ws/device/<deviceUUID>`. The URL carries **no device credential** or account ID. The private staging gate is currently required on all staging requests and **must never be distributed in an actual desktop build**.
3. The gateway verifies that the **D1 device row is active** and its owner account is active, and uses the D1 owner ID to choose `CLOUD_TENANTS.idFromName("mote-cloud-account:" + owner)`. This is **provisional routing, not authentication**. It does not require the client to supply account identity.
4. The gateway deletes caller-supplied internal/tenant headers, overwrites them with server-held values and forwards the WebSocket upgrade to the tenant DO. A separate 32+ character `MOTE_CLOUD_INTERNAL_SECRET` is required by the DO on every internal request. This secret is not the public staging gate and must not ship inside client code.
5. The DO persists its tenant account ID in its own storage. A request bearing a different owner is refused even if misrouted. It validates the D1 device row before upgrading, but does not trust the socket until it receives Protocol v1 `auth` with the **matching device credential** and ID.
6. The DO stores a digest of that authenticated credential and a non-secret connection attachment (device/owner/connection IDs, last heartbeat, actions), so a hibernated socket can be revalidated after revival. **Never persist the raw device secret**. Repeated auth/heartbeat/result events re-check D1, rejecting revoked credentials/devices/disabled accounts.
7. The existing Protocol v1 `auth_result` and `heartbeat_ack` frames are unchanged. Stale/unauthenticated connections close. A superseded connection cannot resolve a newly issued command.

### iPhone lock dispatch

1. The iPhone submits `POST /cloud/v1/devices/:deviceId/commands` with its opaque access bearer token and `{"action":"lock"}`. **No tenant ID from the client is accepted**.
2. The gateway checks D1 session revocation/expiry, account/device ownership and action before finding the owner's DO. A foreign device is indistinguishable from missing/revoked device (404).
3. The DO independently repeats the access session/owner check and verifies that the live device socket still holds an unrevoked credential. It never accepts `unlock`, shell commands or any action except `lock`.
4. The DO sends the existing Protocol v1 `command` frame with a fresh random nonce, unique command ID and `expires_at = created_at + 10_000 ms`. **If the device is offline it immediately returns 409 and stores nothing**.
5. Only `command_result` on the authenticated, unsuperseded socket bound to the same device **and command ID** can settle the request. Command reports arriving after expiry return timeout. Transport closure returns offline; no in-flight command is replayed after reconnect.
6. The outcome is reported as status + command ID. A device reporting `completed` is an agent acknowledgment, not independent evidence that the physical OS actually locked. Real macOS/Windows live acceptance remains required.

## Security and operational constraints

- The **staging gate** and separate **internal DO secret** are two different confidential variables. Operator must configure `MOTE_CLOUD_INTERNAL_SECRET` only in Cloudflare secrets (e.g. `wrangler secret put` with reviewed isolated config); the example intentionally omits its value. Both must be absent from release binaries, Git history, logs and diagnostics.
- This is **staging-only**: public unauthenticated pairing creation and connection attempts need IP/rate/global budgets, admission throttles and abuse protections before the gate can ever be removed.
- The DO tracks at most 32 pending locks per tenant and one per device; every request is deadline-bounded. Account and device revocation are rechecked on the next frame or command, but an **immediate revocation broadcast / eager socket closure** is not yet implemented. This remains a release blocker.
- **Hibernation semantics** and real Cloudflare DO routing are not yet tested by any local Node/CI dry-run. A DO restart loses in-memory in-flight command waiters; do not claim a completed command without an authenticated response.
- The Worker and DO perform separate D1 checks. There remains a TOCTOU window across D1 and DO operations; perform real staging race testing and improve revocation fencing before public release.
- Cross-account tests using synthetic identities and the offline D1 adapter are necessary, **not sufficient** for real multi-user isolation.
- No public Docker/VPS self-host claim. Existing personal one-click Cloudflare self-hosted Worker/DO, macOS/Windows agents, and Protocol v1 remain untouched.

## Verification commands / source of truth

```sh
npm ci
npm ci --prefix relay
npm test --prefix relay
npm run typecheck --prefix relay
npx wrangler deploy --config cloud/wrangler.ci.jsonc --dry-run --outdir dist/cloud
```

Inspect **actual** GitHub CI for this head SHA and verify all jobs. A Wrangler dry-run does not test tenant DO runtime, hibernation or end-to-end physical lock.

## Required P0C3 before public access

1. Prepare a **new, isolated** Cloudflare staging D1 and apply/review `0001_core.sql`, `0002_auth.sql`, `0003_pairing_claim.sql` with backup and rollback. Do not reuse the old personal Relay's SQLite DO or production routing.
2. Configure a distinct disabled-by-default Cloud staging Worker/tenant DO, restricted test credentials, and a real iOS app Bundle ID; perform genuine Apple ID token tests.
3. Verify iOS → Cloud → device WSS → real Windows/macOS `lock` results on physical hardware, including 2-account isolation, delayed result, revocation, hibernation/restart, reconnect and real network outage.
4. Add explicit account deletion, device revoke disconnect, production-appropriate distributed rate limits, per-account quotas and public cost controls; determine signing/installer/website requirements separately.
5. Only after live tests pass and release obligations are met may the team replace the private staging gate with a customer-safe public admission design.

See [P0C1 pairing](cloud-p0c1-pairing.md), [P0B identity](cloud-p0b-identity.md), [P0A security](cloud-p0a-security.md) and [product launch roadmap](https://github.com/Nardo021/Mote/pull/1).

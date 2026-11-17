# Mote Cloud P0C3C — Local workerd / D1 / tenant Durable Object integration

**Date:** 2026-11-17 · **Status:** LOCAL-INTEGRATION PENDING CI; no Cloudflare staging Worker deployed.

## Why this stage exists

P0C3B proved a **disabled** Cloud Worker responds 503 in actual local
workerd. P0C2's device WebSocket/lock tests were mocked with Node's SQLite
adapter and an in-process socket. Neither test exercises the real Cloudflare
Durable Object implementation, persisted D1 binding, upgraded WebSocket
handshake or Worker-to-DO forwarding.

P0C3C adds a separate **ephemeral, local-only** integration workload.
This is not a real Cloudflare deployment, Apple login or physical OS lock.

## Test configuration

`cloud/wrangler.integration.ci.jsonc`:

- Distinct Worker name `mote-cloud-local-ci`, no `workers_dev` / routes.
- A synthetic local-only D1 name and UUID, with the **same** three schema
  migrations. No remote Cloudflare D1 UUID appears in this file.
- Distinct tenant Durable Object binding and SQLite class migration.
- Enabled locally **only** with a generated 256-bit test gate and a separate
  generated 256-bit internal DO secret. The secrets are written to an ignored
  `cloud/.dev.vars` with exclusive create and mode 0600, then deleted.
  If that file already exists, the test refuses to overwrite it.
- Compatibility date remains equal to the verified Cloud staging and CI
  `2026-09-28` baseline. The existing self-host Worker is unchanged.
- `wrangler d1 ... --local --persist-to <temporary directory>` and
  `wrangler dev --local --persist-to <same directory>` use only an ephemeral
  filesystem. **No remote D1 migration, DNS, API token or Worker deployment.**

## Concrete acceptance assertions

`cloud/scripts/test-local-realtime.mjs` starts a local workerd server and
uses two synthetic Apple-subject account rows, two device credential hashes,
and two opaque access-token hashes. It uses Node's native HTTP Upgrade
request and masked WebSocket frames (avoids a new dependency):

1. Missing staging gate returns HTTP 503, correct test gate allows health.
2. Account A can list only A's device and account B can list only B's.
3. An owner `lock` when A's desktop is offline returns 409 and cannot
   be delivered on later connection.
4. B's valid access token cannot issue `lock` to A's device (404).
5. A WebSocket using B's device credential to authenticate as A must close.
6. A matching device credential receives Protocol v1 `auth_result=ok`.
7. The live socket sends a heartbeat and receives a real `heartbeat_ack`.
8. A phone `lock` request passes through gateway → real local tenant DO →
   authenticated WebSocket as a Protocol v1 command, with `expires_at -
   created_at = 10000`; the mock device's `command_result` returns an
   HTTP completed result to the phone.
9. Both account A and account B can hold authenticated WebSockets at once,
   without another account receiving the device command. Attempts to supply
   forged `X-Mote-Cloud-Owner` and internal-secret headers from the desktop
   cannot redirect it to a different account Durable Object.
10. A device disconnect returns future owner commands to 409; no offline
    persistence or queue.

The mock device **does not call macOS/Windows lock APIs**. These tests also
do not force a real Durable Object hibernation/restart or revoke a real
Cloudflare-managed connection; both remain separate release gates.

## Run

```sh
npm ci
npm ci --prefix relay
node cloud/scripts/test-local-realtime.mjs
```

The GitHub Cloud staging CI job must run this in addition to the
disabled-route workerd smoke and bundle dry-run. It must not be marked
PASS until the **current head SHA** run finishes successfully.

## Next stage / deployment blocker

The actual Cloudflare `mote-cloud-staging` Worker/tenant DO is still
absent. It is **not safe to activate**, because the real iOS Sign in with
Apple App ID, platform-native iOS app, operator-only staging secret
provisioning, public rate limits, account deletion, revocation broadcast
and real two-account/hardware cloud tests are incomplete.

Once the local CI passes, the next independent deployment step is a
**disabled, non-routed** staging Worker with a reviewed operator
configuration and independently verified D1 binding. No public
`workers.dev` host/route should be enabled until the protected
end-to-end acceptance evidence exists. Do not substitute an example
Apple Bundle ID or publicly distribute a private Staging gate.

See [P0C3B deployment guards](cloud-p0c3b-staging-gates.md) and
[P0C2 realtime design](cloud-p0c2-realtime.md).

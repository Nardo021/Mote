# Mote public launch roadmap (proposal)

Date: 2026-11-16  
Status: **PROPOSED, NOT IMPLEMENTED**. This is a planning-only document based on the existing `mote-v2` development branch. Do not merge, deploy, publish or change production based solely on this document.

## Baseline (not a new Windows implementation task)

- `mote-v2` is the active 2.0.0 development baseline: Swift macOS Agent, .NET 10 Windows tray Agent, Protocol v1 fixtures, Cloudflare Worker + *one* SQLite Durable Object, and Dashboard.
- The real Windows 11 interactive acceptance is recorded as PASS on 2026-10-02 at commit `707aad0244317cc25f2905d80cd492945e07f1e3` and CI run `36951751688`, including remote lock, disconnect/reconnect and suspend/resume. This does not validate a future changed commit automatically.
- Formal distribution is blocked: `WINDOWS_PRODUCTION_SIGNING_BLOCKED_EXTERNAL_PROVIDER`; Mac Developer ID signing/notarization not executed; no trusted public GitHub release. See `docs/release.md`, `docs/code-signing.md`.
- Native iOS app does not yet exist; `docs/ios.md` describes a former personal-only plan, not the newly requested public App Store direction.
- In `relay/src/worker/index.ts`, every Relay request routes to `RELAY.idFromName("mote")`: **not multi-tenant**. Do not expose this personal controller as a shared free SaaS.

## Product direction

Mote locks the user's own Mac or Windows computer from iPhone. The mobile app, desktop agents and cloud backend are free for users in the planned first public release.

Support two **separate deployment modes**, not one mandatory account model:

1. **Mote Cloud (default):** managed multi-tenant service with iOS sign-in, account-owned devices, short-lived pairing, secure transport and no user-managed server.
2. **Self-hosted (advanced):** preserve today's one-click Cloudflare Worker + Durable Object installation and Protocol v1 / device-bound token functionality. Do **not** resurrect Node/Docker as a second supported runtime.

Do not break or silently migrate personal installations. Never conflate self-hosted Relay administrator with future hosted-user identity.

## Phase A — Finish Windows/macOS public-release readiness

1. Audit current `mote-v2` HEAD and rerun existing Windows/macOS safe CI and release-artifact checks. Reference recorded 2026-10-02 Windows live acceptance rather than claiming it was rerun today.
2. Select exactly one trusted Windows Authenticode signing provider and implement it behind the existing fail-closed production gate. No made-up provider credentials or workaround of SmartScreen.
3. Validate Apple Developer ID signing and macOS notarization with hardened runtime enabled. macOS's private `SACLockScreenImmediate` invocation is a notarization/reliability review risk; do not conceal a failure or bypass policy.
4. Keep a single version tag `v2.0.0` for the combined Windows/macOS release, only after release gates pass.
5. Acceptance: signed + verified release manifests and SHA-256, successful notarization where needed, downloadable trusted assets, fresh device tests, no credential leaks. Unverified gates stay BLOCKED.

## Phase B — Build iOS app MVP against existing personal Relay

Implement a **native SwiftUI** `ios/` application, with a configurable self-hosted Relay URL. Reuse Mote Protocol v1's existing command HTTP semantics, device-scoped `send_command` token, keychain storage, no offline command queue and allowlisted `lock`. Do not create a new command protocol merely because this is iOS.

Minimal screens: first-run setup, Relay pairing/token setup, owned computer list with connection status, explicit Lock button and result, device settings, diagnostics without tokens, privacy/support entry points. A token always remains scoped to a single device. Do not store `device_connection` on the phone. Never trust a request-supplied Activity `source`.

Acceptance: Xcode build + tests; on-device pairing/lock/offline/timeout checks with existing Relay, token persistence through update, error UI. Development with Xcode can start before paid App Store account eligibility is resolved. This MVP is **not** App Store ready yet.

## Phase C — Separate managed Mote Cloud from personal Worker

Recommended topology (architecture proposal, requires security and cost validation):

```text
iOS App → Mote Cloud account API (Cloudflare Worker)
                    │
             D1: users, sessions, devices & ownership
                    │ authorized owner → target
        per-account Durable Object: active device WSS,
           command pending state, presence, pairing
                    │
            macOS / Windows Agent
```

- New hosted deployment configuration, identities, auth, ownership checks and migrations must be separated from the personal one-click `mote` Worker. Reuse vetted protocol/parsing/action code; do not copy a mutable singleton admin database into public tenants.
- Prefer Sign in with Apple as native iOS account identity; verify identity tokens server-side, issue revocable sessions, and enforce ownership for commands, pairing, WebSocket handshake and device deletion. Desktop pairs through a one-time user-approved code or QR, not a common administrator password.
- D1 is authoritative for account / device ownership. Keep each per-account DO responsible for live socket routing and ephemeral pending commands only; make reconnection state explicit. Preserve v1 device wire format where possible. Hosted control API may use versioned paths; do **not** silently change Protocol v1 fixtures.
- Threat tests: account A cannot enumerate/lock/pair/delete B's device even with guessed UUID, arbitrary ID, leaked one-time pairing code, invalid refresh token or fabricated result. Test token rotation, revoke, account deletion, timeouts, duplicate messages and forced DO restart.
- Include privacy data minimization, retention/deletion, request/device quotas, Cloudflare Workers spending limit, operational monitoring and basic abuse/rate limiting. Beta limits such as 3 devices/account and 60 commands/day are **proposals only**, adjustable after measurement.
- Hibernating sockets can save cost, but frequent 30-second heartbeats and alarms can cause wakeups: measure DO requests/duration and cost per active device. Workers Free limits fail-closed when reached; consider Paid's US$5/mo base plus usage if reliability matters. Do not promise unlimited scale for free.
- Stage: isolate tenant data and tests → small opt-in beta → measure stability/cost → only then open to the public.

## Phase D — Public iOS app and App Store gate

Extend the working self-host MVP with Mote Cloud as the default experience and optional self-host settings. Build device registration, Sign in with Apple, account cancellation/deletion from inside the app, credentials lifecycle and genuine online/offline results.

App Store release requirements: annual Apple Developer membership and eligible legal account holder; valid demo account or interactive demo mode; physical device/pairing video if required; privacy policy inside the app and metadata; support URL; account deletion; real screenshots; functional backend; IPv6-only network test; applicable App Review rules. Do not misrepresent developer identity or claim App Review approval prematurely.

Mote is an action controller, **not screen mirroring / generic remote desktop**. Verify correct App Review classification and any naming/trademark collisions before submitting. No subscriptions/IAP in the initial free plan.

## Phase E — Marketing site and release

Build a standalone static landing site (Cloudflare Workers Assets/Pages as appropriate) with:
- precise promise: "Lock your Mac or Windows PC from your iPhone"
- actual Mac/Windows/iOS screenshots, supported versions and plain setup steps
- Mote Cloud Free vs Advanced Self-host, security model, FAQ
- download links **only after signed assets / App Store listing exist**
- privacy, support, terms and account deletion information
- accessibility, responsive design, metadata, OG, favicon and basic SEO.

The **minimum privacy/support/deletion pages must be live before App Review**, even if the full promotional landing is the final polish phase. Do not invent downloads, app ratings, testimonials or reliability metrics.

## Milestone gates and immediate next task

| Gate | Work | Completion evidence |
|---|---|---|
| A | Release blocker audit: Windows signing, Mac notarization | fresh workflows + signature evidence |
| B | iOS self-host MVP | PR, Xcode tests, on-device end-to-end |
| C | Hosted auth + tenant isolation | threat tests, staging, stable cost |
| D | iOS hosted mode + App Store submission | review assets, privacy, approval |
| E | Landing + public announcement | audited live URLs + verified downloads |

**Recommended next Cursor task:** audit `mote-v2` HEAD and open a Draft PR implementing only Phase B iOS self-host MVP. Keep Cloud sign-in, multi-tenant worker, new actions, direct LAN, auto-updater, and production deployment out of scope. Preserve Protocol v1, current Admin Dashboard and Windows release tests. Supply build/test results and manual on-device evidence; do not call a build complete if only a simulator was used.

## Decisions and verification references

- This document records proposed product direction, not implementation.
- Windows 2026-10-02 acceptance: `docs/windows-release-checklist.md`; release gates: `docs/release.md` and `docs/code-signing.md`.
- Current single-instance routing: `relay/src/worker/index.ts`.
- Current iOS personal-only concept: `docs/ios.md` (to update in a later implementation PR, not silently overwrite here).
- Apple: https://developer.apple.com/help/account/membership/program-enrollment/ and https://developer.apple.com/app-store/review/guidelines/
- Cloudflare: https://developers.cloudflare.com/durable-objects/platform/pricing/ and https://developers.cloudflare.com/durable-objects/best-practices/websockets/

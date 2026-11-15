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

**Public launch acceptance principle: zero user-managed infrastructure.** Every first-run screen must be understandable without developer knowledge. "Download desktop + download iOS + create one Mote account + scan/approve + Lock" is the contract. No Relay URL, Cloudflare signup, manually copied token, host setup, manual port forwarding or admin Dashboard in default mode.

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

## Phase B — Native iOS shell and reusable command UI (Cloud-first product design)

Implement a **native SwiftUI** `ios/` app whose **default and prominent entry point is Mote Cloud**. At first launch show "Continue with Apple"; a new user account is provisioned automatically through the hosted identity API. After login, show an empty state with "Add a computer" and a QR scanner. Reuse existing `lock` action semantics, explicit online/offline states and no offline command queue. A secondary Settings → Advanced → Self-hosted Relay entry allows custom URL + device-scoped `send_command` token in Keychain without a Mote Cloud account. Keep the same iOS command UI between modes, but do not conflate credentials or administrators. Build/test the SwiftUI shell and self-host adapter while hosted auth is implemented separately, then validate the hosted first-run journey as the main acceptance gate.

Minimum screens: account onboarding (Cloud default), empty state, camera QR scanner + manual code alternative, pairing confirmation, named device list with presence and platform icon, Lock confirmation/result, device removal, settings with account deletion, privacy/support, and hidden-in-Advanced self-host configuration. No desktop account password entry is needed in Cloud mode: the desktop shows a short-lived pairing QR/code and the already signed-in iOS app approves it. Protect access/refresh tokens with Keychain; never store `device_connection` on iOS or trust a request-supplied Activity `source`.

Acceptance: Xcode build + tests; Cloud sign-in against isolated staging; real-device QR pairing of both desktop platforms; online lock, offline/timeout, failed/duplicate/revoked command handling; no manual Cloud host or token field anywhere in default path. The self-host adapter is regression-tested separately. A simulator-only build is **not** mobile device acceptance.

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

Release the **Mote Cloud-first** iOS experience after the hosted account + pairing + command vertical slice is live and tested. Keep Self-hosted Relay as a clearly labeled advanced alternative. Build device registration, Sign in with Apple, in-app full account deletion and session revocation, credentials lifecycle, device removal and genuine online/offline results.

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
| B | Native iOS Cloud-first shell + self-host adapter | PR, Xcode tests, design walkthrough |
| C | Hosted account API + tenant isolation + desktop QR pairing | threat tests, staging, two-account cross-platform E2E, stable cost |
| D | iOS hosted mode + App Store submission | review assets, privacy, approval |
| E | Landing + public announcement | audited live URLs + verified downloads |

**Recommended next Cursor task:** audit `mote-v2` HEAD, then create a small Draft PR for the **hosted auth/pairing contract and threat model** (design + tests initially), while an independent iOS PR develops the Cloud-first SwiftUI screens. Do not present self-host-only onboarding as the normal first-launch experience. Do not deploy the existing single-tenant Durable Object as public cloud. Keep runtime change and production deploy as explicit later gates.

## Decisions and verification references

- This document records proposed product direction, not implementation.
- Windows 2026-10-02 acceptance: `docs/windows-release-checklist.md`; release gates: `docs/release.md` and `docs/code-signing.md`.
- Current single-instance routing: `relay/src/worker/index.ts`.
- Current iOS personal-only concept: `docs/ios.md` (to update in a later implementation PR, not silently overwrite here).
- Apple: https://developer.apple.com/help/account/membership/program-enrollment/ and https://developer.apple.com/app-store/review/guidelines/
- Cloudflare: https://developers.cloudflare.com/durable-objects/platform/pricing/ and https://developers.cloudflare.com/durable-objects/best-practices/websockets/


## User-requested product requirements: one-account, zero-configuration public mode (2026-11-16)

### Definition of done: first-user story

For a brand-new user who has never seen Mote:

1. Install signed Mote for Mac or Mote for Windows from the official website; on launch, default to **Mote Cloud** with an embedded trusted public service URL. Desktop offers "Connect this computer" and displays a short-lived QR + accessible manual pairing code. It does not require the user to register a second account, enter Relay URLs, create tokens or configure router/firewall.
2. Install free Mote iOS from App Store. First-launch primary CTA: **Continue with Apple**; this authenticates or automatically registers a Mote account. No password, separate verification email or developer configuration is required. If an alternative account method is introduced, document exact provider rules, abuse limits and account-linking, and avoid accidentally making duplicate accounts.
3. On iPhone, **Add Computer** → scan desktop QR, inspect the computer's name + platform + short matching confirmation code → **Approve**. Desktop obtains only its own scoped device credential after server-confirmed owner approval and stores it securely in OS secret storage.
4. Device becomes **Online** on iOS within a bounded timeout. Tap **Lock**, observe progress and a truthful result. The desktop OS locks in a real E2E test. Offline devices return **Offline** promptly; no late execution on reconnection.
5. Reopening both apps later preserves login and device trust, reconnects on normal network recovery, and never requires setup again. One account can manage multiple computers with unambiguous device names; remove/revoke a computer from iOS, then verify the removed desktop cannot reconnect using its old credential.
6. First-run usability must be tested with a **new nondeveloper** using only an iPhone, supported desktop and the two installers. No docs, command line, manual auth tokens, Cloudflare account, Dashboard or developer help is permitted in the happy path.

### Explicit product boundaries

- Free to end users at launch, without IAP/subscription, does **not** mean unlimited backend usage or zero operator cost.
- Cloud is the default; self-host is advanced and optional. The same desktop and iOS downloads support both modes; no separate "self-host edition".
- For Cloud mode one Mote identity spans all owned Mac/Windows desktop devices. In **self-host mode**, the user's own server has its **own** admin credentials and per-device tokens: no Mote Cloud login or cross-mode sync is required. Label the different identity domains clearly.
- Desktop service URL, identity issuer, API allowlist and certificate/TLS validation must be determined by signed client configuration/build, not by trusting arbitrary QR content. QR conveys a short-lived pairing challenge, not executable code or a secret as a raw permanent URL.
- Only remote **lock** in the first release; never remote unlock, screen viewing, shell, script execution or privileged installer requirements.

## Hosted backend: architecture and authorization contract

### Recommended Cloudflare topology (PROPOSED)

```
iOS app (SwiftUI) -- Sign in with Apple -- Mote Cloud Worker account API
                                                    |
                                                  D1
                                 users, identity_subjects, sessions,
                                 registered_devices, account ownership
                                                    |
                         authorization and tenant routing at trusted edge
                                                    |
                           Durable Object keyed by verified account ID
                                     |           |
                                Mac WSS      Windows WSS
```

**Security requirements to implement before public access:**

- Create a distinct hosted Cloudflare Worker deployment, bindings, secrets, migrations and subdomain; retain the existing self-deployed Worker and Dashboard as supported advanced option. Never re-use the hard-coded `idFromName("mote")` singleton for multiple customers.
- The Worker validates Sign in with Apple server-side using published keys, audience, issuer, nonce/expiry and stable subject ID; do not authorize by unverified email or a browser-provided account ID. Keep short-lived access credentials and independently revocable refresh sessions; support credential rotation, logout-all and deletion.
- D1 is the authority for account owner/device relationship. The authoritative device lookup **must** precede routing a request to an account's Durable Object. Object keys come from verified ownership, never request-supplied user IDs. Repeat appropriate authorization on pair approval, WebSocket admission and device mutation; never rely on hidden client buttons.
- Pairing is two-step: desktop receives a high-entropy short-lived pairing ticket/QR and optionally numeric display code; authenticated phone authorizes; server atomically claims unowned device for that user; only the waiting **same** authenticated pairing connection receives a fresh device credential. One-time ticket, short expiry, replay/reuse failure, rate limits and explicit confirmation mitigate account/device hijack. Device credentials never appear in QR or logs.
- Preserve current Protocol v1 command shape, 10s command TTL and strict allowlist when possible; keep cloud-specific account APIs under distinct versioned routes. Verify command-result origin and device connection binding; do not treat any device-supplied text as an action to execute.
- Owner authorization is tested under two real accounts A/B: A cannot list, pair, transfer, lock, revoke, observe presence or retrieve audit of B's devices. Include guessed UUID, leaked expired QR, concurrent claims, stale cached ownership, credential rotation, DO eviction/restart, iOS token expiry and account deletion.
- Account deletion revokes mobile sessions and all device credentials, disconnects active sockets, removes account data according to policy, and has a clear support procedure when partial failures occur.
- Cloud service metrics: active/pairing/connected users, device connection churn, request/error/latency and measured billable DO messages/alarms/duration. Do not log raw auth tokens, device secrets or human identifiers in plain application logs.
- Cost guardrails: initial small invited beta, quota settings, monitoring/spend alerts, emergency registration cap and an incident runbook. Cloudflare pricing changes; verify before any public launch.

### Cost-sensitive design choices

Cloudflare's WebSocket Hibernation API reduces billable idle duration but **30-second agent heartbeats and frequent DO alarms still cause invocations**. Benchmark with realistic concurrently connected devices, reconnect storms and 24-hour soak tests. Optimize heartbeats only with observed timeout effects and protocol-compatibility tests.

Starting suggestion: configurable beta quotas around 3 computers/account and 60 lock attempts/day, **not** advertised hard limits or commitments. Choose appropriate Worker/D1/DO plan from measured usage, maintain budget alerts and graceful throttling; never assume Free tier is a production reliability SLA.

## Self-hosted: supported scope and documentation (required for launch)

### Support definition

**First supported self-host route:** **Bring Your Own Cloudflare** (existing one-click Worker + per-install Durable Object; the customer owns their Cloudflare account, bill and domain). This is an independently deployed personal Relay, *not a slice of the Mote Cloud SaaS*.

A second **Docker/VPS/LAN self-host** route is **NOT CURRENTLY SUPPORTED on `mote-v2`**. It was removed from this branch. If traditional home-server/VPS support becomes mandatory, it requires an explicit runtime/storage design, compatibility testing, security patching and a separately approved milestone. Do not imply the old Docker instructions still work.

### Self-host happy path

1. From landing → Docs → Self-host, click the **verified** Deploy to Cloudflare button with a clear note that users need their own Cloudflare account and may incur their own provider charges.
2. Deploy the user's private Worker, configure an admin password using the provider's secure setup (never show secrets in docs or commit them), and open the **user-owned** Dashboard.
3. On Mac/Windows choose Settings → Advanced → **Self-hosted Relay** and enter their Worker HTTPS URL; pair/approve via the private Dashboard.
4. In iOS choose Settings → Advanced → **Self-hosted Relay**, enter the Relay URL and scoped device token through a secure connection, then lock the paired computer. Support manual copy/paste initially; optional one-time QR setup can follow after independently reviewed secret handling.
5. Verify self-host does not contact Mote Cloud API for accounts, device registration or remote commands; browser/app updates may still use documented public download/update infrastructure.
6. Document update/migrate, credential revocation, backups, data deletion, platform failure recovery and migrating back to Cloud as **explicit manual re-pairing**, never transferring secrets silently.

### Self-host security

Reject HTTP and untrusted TLS in production self-host mode. Allow user-controlled HTTPS origin only for that mode, pin the selected profile to its credential origin, require confirmation before changing endpoints, and never send Mote Cloud tokens to a self-hosted relay. Provide simple **Reset self-host profile** and **Return to Mote Cloud** actions with transparent credential consequences.

## Documentation and information architecture (a release blocker, not an afterthought)

There are **two audiences**. **User docs** must have simple visuals and task-first language; **developer/operator docs** may mention Worker, D1, schema and migrations. Every user-facing setup page must show tested screens, no placeholder commands, no unexplained protocol terms or stale personal-only instructions.

### Required docs/pages and their owners

| File or URL | Audience | Required content | Release acceptance |
|---|---|---|---|
| `README.md` | Everyone | What Mote does; Cloud is zero-config default; available platforms; verified downloads; self-host docs link | Reflects tested release, not dev-only branch |
| `docs/quickstart.md` | New users | Download Windows/Mac, install iOS, Apple login, QR approval, first lock, screenshots, 5-minute troubleshooting | A nondeveloper succeeds unassisted |
| `docs/self-host/cloudflare.md` | Self-host | One-click deploy, Cloudflare prerequisites/cost ownership, admin bootstrap, domain, both desktop agents, iOS advanced config, test lock | Fresh empty CF account deployment tested |
| `docs/self-host/maintenance.md` | Self-host | Updates, migrations, backup/restore limitations, token rotation, revoke, reset, troubleshooting, security notices | Recovery tested or clearly marked unsupported |
| `docs/faq.md` | Everyone | Internet requirements, iOS-only controller, supported systems, free vs self-host, privacy, offline commands, multiple devices | Nonmarketing, accurate answers |
| `docs/security.md` + `docs/protocol.md` | Developers | Cloud identity boundaries vs self-host credentials, tenant isolation, pairing, no arbitrary execution, v1 compatibility | Security tests match docs |
| `docs/cloud-operations.md` | Operator | Service topology, migrations, rate limits, incident/abuse response, rollback, monitoring, cost ceiling | Staging and recovery drill |
| `docs/ios.md`, `docs/release.md` | Developers | App Store flow, signing, TestFlight, Windows signing, Mac notarization, version compatibility | No personal-only plan presented as current |
| Website: `/privacy`, `/support`, `/account/delete` | App Store/users | Policy, contact route, deletion instructions | Public links live before submission |
| Website: `/docs`, `/download`, homepage | Users | Screenshots, prominent Get Mote, supported OS, download integrity, Self-host link | No dead links or false availability |

Add a docs index and navigation in the site, version docs to matching releases, run CI link checking/Markdown validation, and treat broken quickstart steps as **release blockers**. EN-first user docs is a reasonable release assumption; Chinese translations may follow after the English path has been validated.

## Explicit end-to-end release gate (do not mark done from a successful build alone)

**Beta gate:** Separate hosted staging accessible, accounts A/B isolation suite passes, iOS login + device add + lock in a real iPhone and both real Windows/macOS desktops, offline path, revoked device, expired QR, DO restart, network recovery and deletion paths tested. Log current commit/PR/CI links and test environment.

**Desktop distribution gate:** Trusted Authenticode signed Windows zip and verified macOS Developer ID signed/notarized app; fresh testing and hashes; no false official download for unsigned releases.

**App Store gate:** Apple-approved app with a genuine functional backend, in-app account deletion, current privacy/support URLs, actual screenshots, reviewable demo path and secure sign-in. Comply with App Review 4.8/5.1.1 as applicable. Apple's published requirements are authoritative: https://developer.apple.com/app-store/review/guidelines/ and https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/.

**Self-host gate:** A new user can deploy on their own Cloudflare account with no developer intervention, link the same desktop and iOS apps, lock and revoke, and follow update/recovery docs. Do not claim Docker/VPS support without its own implementation.

**Public launch gate:** The home page, download links, Apple listing, quickstart, self-host docs, privacy/support URLs, service status and user support all work on public origins. Confirm quota/monitoring/rollbacks and log any known limitations. A verified launch is not the same as merging a docs PR.

## Revised implementation slices for Cursor

- **P0 — design/auth contracts:** audit `mote-v2`; document cloud ownership, pairing ticket protocol, account/token lifecycle, threat tests and current v1 compatibility. Implement an isolated hosted staging skeleton, **not production**. Draft PR with negative authorization tests; no new manual deployment for default users.
- **P1 — iOS Cloud-first interface:** new native SwiftUI project, Apple login shell, device list/QR scanner, credential lifecycle and lock states behind a mocked hosted API, plus advanced self-host adapter. UI tests and Xcode build; never claim real E2E from mock data.
- **P2 — desktop hosted provisioning:** Mac and Windows Cloud default first-run wizard, short-lived QR/code and credential receipt via authenticated pairing; preserve advanced self-host URL and existing device secrets. Both platform CI; real device tests.
- **P3 — complete vertical slice:** tie P0–P2 together against isolated staging, verify two-account tenant isolation, real QR registration, physical locks, offline/no-queue and malicious pairing tests; dogfood with several devices.
- **P4 — self-host docs and distribution:** preserve one-click deploy, release testing, update macOS/Windows trusted signatures, public documentation with independent tester. Marketing/privacy/support site skeleton can run in parallel.
- **P5 — public beta, App Review and release:** measured cost/reliability; release after platform signing, hosted safety, docs and Apple approval. Final landing polish may follow launch readiness but the required privacy/support pages precede submission.

No phase is marked implemented merely because this plan exists.

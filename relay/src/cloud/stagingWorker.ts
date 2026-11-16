import { timingSafeEqual } from "node:crypto";

import {
  AppleIdentityError,
  fetchAppleJwks,
  verifyAppleIdentityToken,
  type AppleJwks,
} from "./appleIdentity.js";
import { CloudIdentityRepository, type CloudD1Database } from "./identityRepository.js";
import { CloudPairingRepository } from "./pairingRepository.js";
import { authorizeCloudCommandAdmission } from "./tenantAdmission.js";

/**
 * Entirely separate staging-only Worker entrypoint. The original self-hosted
 * relay/src/worker/index.ts must NOT import, route to or deploy this handler.
 */
/** Real namespace binding is supplied by the isolated Cloud Worker config. */
export type CloudTenantNamespace = {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
};

export type CloudStagingEnv = Readonly<{
  CLOUD_DB?: CloudD1Database;
  MOTE_CLOUD_STAGING_ENABLED?: string;
  MOTE_CLOUD_STAGING_GATE?: string;
  APPLE_CLIENT_ID?: string;
  CLOUD_TENANTS?: CloudTenantNamespace;
  MOTE_CLOUD_INTERNAL_SECRET?: string;
}>;

type HandlerDependencies = Readonly<{
  jwks?: () => Promise<AppleJwks>;
  now?: () => number;
}>;

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
} as const;

function respond(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: SECURITY_HEADERS });
}

function gateMatches(provided: string | null, configured: string | undefined): boolean {
  if (!provided || !configured || configured.length < 32 ||
      provided.length !== configured.length) return false;
  return timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(configured, "utf8"));
}

async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > 16_384) return null;
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > 16_384) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7);
  return /^[A-Za-z0-9_-]{32,128}$/.test(token) ? token : null;
}

/**
 * P0B staging identity API. Disabled unless BOTH the explicit enable flag
 * and the private non-shipped staging gate secret are configured.
 *
 * NEVER embed MOTE_CLOUD_STAGING_GATE in a public application.
 * Rate-limit and pairing hardening precede removing this staging-only gate.
 */
export function createCloudStagingHandler(deps: HandlerDependencies = {}) {
  return async function handle(request: Request, env: CloudStagingEnv): Promise<Response> {
    if (
      env.MOTE_CLOUD_STAGING_ENABLED !== "true" ||
      !env.CLOUD_DB ||
      !env.APPLE_CLIENT_ID ||
      !gateMatches(request.headers.get("X-Mote-Staging-Gate"), env.MOTE_CLOUD_STAGING_GATE)
    ) {
      return respond(503, { error: "staging_unavailable" });
    }
    const url = new URL(request.url);
    if (url.protocol !== "https:" &&
        !(url.hostname === "127.0.0.1" || url.hostname === "localhost")) {
      return respond(400, { error: "https_required" });
    }
    const nowMs = (deps.now ?? Date.now)();
    const repo = new CloudIdentityRepository(env.CLOUD_DB);
    const pairing = new CloudPairingRepository(env.CLOUD_DB);

    try {
      if (url.pathname === "/cloud/v1/health" && request.method === "GET") {
        return respond(200, { service: "mote-cloud", status: "staging" });
      }

      if (url.pathname === "/cloud/v1/auth/challenge" && request.method === "POST") {
        return respond(201, await repo.createChallenge(nowMs));
      }

      if (url.pathname === "/cloud/v1/auth/apple" && request.method === "POST") {
        const body = await jsonBody(request);
        if (typeof body?.identityToken !== "string" ||
            typeof body.challengeId !== "string") {
          return respond(400, { error: "invalid_request" });
        }
        const expectedNonceHash = await repo.pendingChallengeHash(body.challengeId, nowMs);
        if (!expectedNonceHash) return respond(401, { error: "authentication_failed" });
        const identity = await verifyAppleIdentityToken(
          body.identityToken, await (deps.jwks ?? fetchAppleJwks)(),
          {
            audience: env.APPLE_CLIENT_ID,
            expectedNonceHash,
            nowSec: Math.floor(nowMs / 1000),
          },
        );
        if (!(await repo.consumeChallenge(body.challengeId, expectedNonceHash, nowMs))) {
          return respond(401, { error: "authentication_failed" });
        }
        const accountId = await repo.createOrGetAccount(identity.subject, nowMs);
        if (!accountId) return respond(403, { error: "account_disabled" });
        return respond(200, { accountId, ...(await repo.issueSession(accountId, nowMs)) });
      }

      if (url.pathname === "/cloud/v1/session/refresh" && request.method === "POST") {
        const body = await jsonBody(request);
        if (typeof body?.refreshToken !== "string") return respond(400, { error: "invalid_request" });
        const tokens = await repo.rotateRefresh(body.refreshToken, nowMs);
        return tokens ? respond(200, tokens) : respond(401, { error: "unauthenticated" });
      }

      if (url.pathname === "/cloud/v1/session/logout" && request.method === "POST") {
        const raw = bearerToken(request);
        if (!raw || !(await repo.authenticateAccess(raw, nowMs))) {
          return respond(401, { error: "unauthenticated" });
        }
        await repo.revokeAccessSession(raw, nowMs);
        return respond(204, null);
      }

      if (
        (url.pathname === "/cloud/v1/me" || url.pathname === "/cloud/v1/devices") &&
        request.method === "GET"
      ) {
        const raw = bearerToken(request);
        const session = raw ? await repo.authenticateAccess(raw, nowMs) : null;
        if (!session) return respond(401, { error: "unauthenticated" });
        if (url.pathname === "/cloud/v1/me") {
          return respond(200, { accountId: session.accountId });
        }
        return respond(200, { devices: await repo.listActiveDevices(session.accountId) });
      }

      // Staging-only pairing. The gate must never ship in user applications.
      // Pairing creation is desktop-internal and subject to pre-public rate-limit
      // work. Proof material is only accepted in request bodies, never URLs.
      if (url.pathname === "/cloud/v1/pairings" && request.method === "POST") {
        const body = await jsonBody(request);
        if (typeof body?.deviceId !== "string" ||
            typeof body.deviceName !== "string" ||
            (body.platform !== "macos" && body.platform !== "windows") ||
            typeof body.deviceCredentialHash !== "string" ||
            typeof body.pollSecretHash !== "string") {
          return respond(400, { error: "invalid_request" });
        }
        const created = await pairing.create({
          deviceId: body.deviceId,
          deviceName: body.deviceName,
          platform: body.platform,
          deviceCredentialHash: body.deviceCredentialHash,
          pollSecretHash: body.pollSecretHash,
        }, nowMs);
        return created ? respond(201, created) : respond(409, { error: "pairing_unavailable" });
      }

      const pairingPath = /^\/cloud\/v1\/pairings\/([a-f0-9-]{36})\/(preview|approve|status)$/.exec(url.pathname);
      if (pairingPath && request.method === "POST") {
        const [, ticketId, operation] = pairingPath;
        if (!ticketId) return respond(404, { error: "not_found" });
        const body = await jsonBody(request);
        if (operation === "status") {
          if (typeof body?.pollSecret !== "string") {
            return respond(400, { error: "invalid_request" });
          }
          const status = await pairing.poll(ticketId, body.pollSecret, nowMs);
          return status ? respond(200, { status }) : respond(404, { error: "not_found" });
        }

        const raw = bearerToken(request);
        const session = raw ? await repo.authenticateAccess(raw, nowMs) : null;
        if (!session) return respond(401, { error: "unauthenticated" });
        if (typeof body?.claimSecret !== "string") {
          return respond(400, { error: "invalid_request" });
        }
        const preview = await pairing.preview(ticketId, body.claimSecret, nowMs);
        if (!preview) return respond(404, { error: "not_found" });
        if (operation === "preview") return respond(200, preview);

        // Explicit visual code confirmation in the iOS pairing UI.
        if (body.confirmedCode !== preview.verificationCode) {
          return respond(400, { error: "confirmation_required" });
        }
        const approved = await pairing.approve(
          ticketId, body.claimSecret, session.accountId, nowMs,
        );
        return approved ? respond(200, { status: "approved" }) : respond(409, { error: "pairing_unavailable" });
      }


      // The public WS URL contains ONLY a device UUID. It is a provisional
      // D1 owner lookup; the target DO must independently verify the v1
      // device auth frame credential BEFORE admitting the socket.
      const wsRoute = /^\/cloud\/v1\/ws\/device\/([a-f0-9-]{36})$/i.exec(url.pathname);
      if (wsRoute && request.method === "GET") {
        if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
          return respond(426, { error: "upgrade_required" });
        }
        const deviceId = wsRoute[1];
        if (!deviceId || !env.CLOUD_TENANTS ||
            !env.MOTE_CLOUD_INTERNAL_SECRET ||
            env.MOTE_CLOUD_INTERNAL_SECRET.length < 32) {
          return respond(503, { error: "service_unavailable" });
        }
        const row = await env.CLOUD_DB.prepare(
          `SELECT d.owner_account_id FROM cloud_devices d
           JOIN cloud_accounts a ON a.id = d.owner_account_id
           WHERE d.id = ? AND d.status = 'active' AND a.status = 'active'`,
        ).bind(deviceId).first<{ owner_account_id: string }>();
        if (!row) return respond(404, { error: "not_found" });
        const key = `mote-cloud-account:${row.owner_account_id}`;
        const stub = env.CLOUD_TENANTS.get(env.CLOUD_TENANTS.idFromName(key));
        // Copy the original upgrade request (including WebSocket handshake),
        // but REPLACE all privileged headers with server-owned values.
        const target = new URL(`/internal/ws/${deviceId}`, request.url);
        const forwarded = new Request(target, request);
        const headers = new Headers(forwarded.headers);
        headers.delete("Authorization");
        headers.delete("X-Mote-Staging-Gate");
        headers.delete("X-Mote-Cloud-Internal");
        headers.delete("X-Mote-Cloud-Owner");
        headers.set("X-Mote-Cloud-Internal", env.MOTE_CLOUD_INTERNAL_SECRET);
        headers.set("X-Mote-Cloud-Owner", row.owner_account_id);
        return stub.fetch(new Request(forwarded, { headers }));
      }

      const commandRoute = /^\/cloud\/v1\/devices\/([a-f0-9-]{36})\/commands$/i.exec(url.pathname);
      if (commandRoute && request.method === "POST") {
        const deviceId = commandRoute[1];
        const accessToken = bearerToken(request);
        if (!accessToken) return respond(401, { error: "unauthenticated" });
        if (!deviceId) return respond(404, { error: "not_found" });
        const body = await jsonBody(request);
        if (!body || body.action === undefined) {
          return respond(400, { error: "invalid_request" });
        }
        const allowed = await authorizeCloudCommandAdmission(
          env.CLOUD_DB, accessToken, deviceId, body.action, nowMs,
        );
        if (!allowed.allowed) {
          return respond(allowed.status, { error: allowed.reason });
        }
        if (!env.CLOUD_TENANTS || !env.MOTE_CLOUD_INTERNAL_SECRET ||
            env.MOTE_CLOUD_INTERNAL_SECRET.length < 32) {
          return respond(503, { error: "service_unavailable" });
        }
        const stub = env.CLOUD_TENANTS.get(
          env.CLOUD_TENANTS.idFromName(`mote-cloud-account:${allowed.tenantAccountId}`),
        );
        return stub.fetch(new Request("https://mote-cloud.internal/internal/command", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Mote-Cloud-Internal": env.MOTE_CLOUD_INTERNAL_SECRET,
            "X-Mote-Cloud-Owner": allowed.tenantAccountId,
          },
          body: JSON.stringify({ accessToken, deviceId: allowed.deviceId, action: "lock" }),
        }));
      }

      // Account deletion and public enrollment remain unimplemented.
      // Never delegate Cloud routes to the personal Relay singleton.
      return respond(404, { error: "not_found" });
    } catch (error) {
      if (error instanceof AppleIdentityError) {
        return respond(401, { error: "authentication_failed" });
      }
      console.error("mote cloud staging request failed", {
        path: url.pathname, errorName: error instanceof Error ? error.name : "unknown",
      });
      return respond(503, { error: "service_unavailable" });
    }
  };
}

const handler = createCloudStagingHandler();
export default { fetch: handler };

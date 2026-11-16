import { timingSafeEqual } from "node:crypto";

import {
  AppleIdentityError,
  fetchAppleJwks,
  verifyAppleIdentityToken,
  type AppleJwks,
} from "./appleIdentity.js";
import { CloudIdentityRepository, type CloudD1Database } from "./identityRepository.js";

/**
 * Entirely separate staging-only Worker entrypoint. The original self-hosted
 * relay/src/worker/index.ts must NOT import, route to or deploy this handler.
 */
export type CloudStagingEnv = Readonly<{
  CLOUD_DB?: CloudD1Database;
  MOTE_CLOUD_STAGING_ENABLED?: string;
  MOTE_CLOUD_STAGING_GATE?: string;
  APPLE_CLIENT_ID?: string;
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
  return new Response(JSON.stringify(body), { status, headers: SECURITY_HEADERS });
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

      // Command dispatch, device WS, pairing and account deletion intentionally
      // do NOT exist yet. Never delegate to the personal Relay singleton.
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

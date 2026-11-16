import { createHash, timingSafeEqual } from "node:crypto";

export const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
const ISSUER = "https://appleid.apple.com";
const MAX_TOKEN_LENGTH = 12_288;
const MAX_CLOCK_SKEW_SEC = 60;

type ObjectMap = Record<string, unknown>;
export type ApplePublicJwk = Readonly<{
  kty: "RSA";
  kid: string;
  use?: string;
  alg?: string;
  n: string;
  e: string;
}>;
export type AppleJwks = Readonly<{ keys: readonly ApplePublicJwk[] }>;
export type VerifiedAppleIdentity = Readonly<{ subject: string }>;

function record(value: unknown): value is ObjectMap {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function decodeSegment(value: string): unknown {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > MAX_TOKEN_LENGTH) {
    throw new AppleIdentityError("Invalid JWT encoding.");
  }
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
  } catch {
    throw new AppleIdentityError("Invalid JWT JSON.");
  }
}

function digestNonce(nonce: string): Buffer {
  return createHash("sha256").update(nonce, "utf8").digest();
}

export function hashAppleNonce(nonce: string): string {
  return digestNonce(nonce).toString("hex");
}

export class AppleIdentityError extends Error {
  constructor(message = "Apple identity could not be verified.") {
    super(message);
    this.name = "AppleIdentityError";
  }
}

/**
 * Verifies an Apple-issued JWS against pinned issuer/audience, trusted JWKS
 * and a one-time nonce digest previously stored by the server in D1.
 *
 * The caller MUST atomically consume that nonce challenge after verification.
 * This function does not do persistence, account creation or replay prevention.
 */
export async function verifyAppleIdentityToken(
  token: string,
  jwks: AppleJwks,
  options: Readonly<{
    audience: string;
    expectedNonceHash: string;
    nowSec: number;
  }>,
): Promise<VerifiedAppleIdentity> {
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > MAX_TOKEN_LENGTH ||
    !/^[0-9a-f]{64}$/i.test(options.expectedNonceHash) ||
    !options.audience ||
    !Number.isSafeInteger(options.nowSec)
  ) {
    throw new AppleIdentityError();
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new AppleIdentityError("Invalid JWT segments.");
  }
  const [protectedHeader, body, signature] = parts;
  if (!protectedHeader || !body || !signature || !/^[A-Za-z0-9_-]+$/.test(signature)) {
    throw new AppleIdentityError("Invalid JWT shape.");
  }
  const header = decodeSegment(protectedHeader);
  const claims = decodeSegment(body);
  if (
    !record(header) || !record(claims) ||
    header.alg !== "RS256" ||
    typeof header.kid !== "string" || header.kid.length === 0 ||
    header.kid.length > 128 ||
    header.crit !== undefined ||
    (header.typ !== undefined && header.typ !== "JWT")
  ) {
    throw new AppleIdentityError("Untrusted JWT header.");
  }
  const matchingKey = jwks.keys.find(
    (key) => key.kid === header.kid && key.kty === "RSA" &&
      (key.use === undefined || key.use === "sig") &&
      (key.alg === undefined || key.alg === "RS256") &&
      typeof key.n === "string" && typeof key.e === "string",
  );
  if (!matchingKey) {
    throw new AppleIdentityError("Unknown Apple signing key.");
  }

  let verified = false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: matchingKey.n, e: matchingKey.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    verified = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      Buffer.from(signature, "base64url"),
      new TextEncoder().encode(`${protectedHeader}.${body}`),
    );
  } catch {
    throw new AppleIdentityError("Apple signature validation failed.");
  }
  if (!verified) {
    throw new AppleIdentityError("Apple signature validation failed.");
  }

  const { iss, aud, sub, iat, exp, nbf, nonce } = claims;
  if (
    iss !== ISSUER ||
    aud !== options.audience ||
    typeof sub !== "string" || sub.length < 1 || sub.length > 256 ||
    !Number.isSafeInteger(iat) || !Number.isSafeInteger(exp) ||
    Number(iat) > options.nowSec + MAX_CLOCK_SKEW_SEC ||
    Number(exp) <= options.nowSec ||
    Number(exp) - Number(iat) > 24 * 60 * 60 ||
    (nbf !== undefined &&
      (!Number.isSafeInteger(nbf) || Number(nbf) > options.nowSec + MAX_CLOCK_SKEW_SEC)) ||
    typeof nonce !== "string" ||
    nonce.length < 16 || nonce.length > 512
  ) {
    throw new AppleIdentityError("Invalid Apple identity claims.");
  }
  const expected = Buffer.from(options.expectedNonceHash, "hex");
  const actual = digestNonce(nonce);
  if (!timingSafeEqual(actual, expected)) {
    throw new AppleIdentityError("Apple identity nonce mismatch.");
  }
  return { subject: sub };
}

/** Fetch only Apple's fixed public JWKS endpoint; no caller-provided URL. */
export async function fetchAppleJwks(fetcher: typeof fetch = fetch): Promise<AppleJwks> {
  const res = await fetcher(APPLE_JWKS_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(4_000),
  });
  if (!res.ok) {
    throw new AppleIdentityError("Apple key service unavailable.");
  }
  const payload = await res.text();
  if (payload.length > 32_768) {
    throw new AppleIdentityError("Apple key response too large.");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(payload) as unknown;
  } catch {
    throw new AppleIdentityError("Invalid Apple key response.");
  }
  if (!record(decoded) || !Array.isArray(decoded.keys) || decoded.keys.length > 24) {
    throw new AppleIdentityError("Invalid Apple keyset.");
  }
  const keys: ApplePublicJwk[] = [];
  for (const item of decoded.keys as unknown[]) {
    if (
      record(item) &&
      item.kty === "RSA" &&
      typeof item.kid === "string" &&
      typeof item.n === "string" &&
      typeof item.e === "string" &&
      (item.use === undefined || item.use === "sig") &&
      (item.alg === undefined || item.alg === "RS256")
    ) {
      keys.push({
        kty: "RSA",
        kid: item.kid,
        n: item.n,
        e: item.e,
        ...(item.alg === undefined ? {} : { alg: item.alg as string }),
        ...(item.use === undefined ? {} : { use: item.use as string }),
      });
    }
  }
  if (keys.length === 0) {
    throw new AppleIdentityError("Apple JWKS has no usable signing keys.");
  }
  return { keys };
}

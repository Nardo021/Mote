import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import {
  APPLE_JWKS_URL,
  fetchAppleJwks,
  hashAppleNonce,
  verifyAppleIdentityToken,
  type AppleJwks,
} from "../src/cloud/appleIdentity.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = publicKey.export({ format: "jwk" });
const keys: AppleJwks = {
  keys: [{ kty: "RSA", kid: "test-apple-kid", alg: "RS256", use: "sig", n: jwk.n!, e: jwk.e! }],
};
const nowSec = 1_800_000_000;
const nonce = "super-random-server-issued-nonce-value-123";
const audience = "com.nardo021.mote.testing.test.ios";

function jwt(overrides: Record<string, unknown> = {}, header: Record<string, unknown> = {}): string {
  const head = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test-apple-kid", ...header })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: "https://appleid.apple.com", aud: audience, sub: "apple-team-scoped-user-a",
    iat: nowSec - 30, exp: nowSec + 600, nonce, ...overrides,
  })).toString("base64url");
  const data = `${head}.${payload}`;
  return `${data}.${sign("RSA-SHA256", Buffer.from(data), privateKey).toString("base64url")}`;
}

const settings = { audience, expectedNonceHash: hashAppleNonce(nonce), nowSec };

test("verifies genuine RS256 JWT with Apple issuer, audience and server nonce", async () => {
  assert.deepEqual(await verifyAppleIdentityToken(jwt(), keys, settings), {
    subject: "apple-team-scoped-user-a",
  });
});

test("rejects forged claims, changed signature and invalid header", async () => {
  const examples = [
    jwt({ iss: "https://attacker.invalid" }),
    jwt({ aud: "another.bundle" }),
    jwt({ nonce: "forged-server-nonce-value" }),
    jwt({ exp: nowSec }),
    jwt({ iat: nowSec + 600 }),
    jwt({ nbf: nowSec + 600 }),
    jwt({ sub: "" }),
    jwt({}, { alg: "none" }),
    jwt({}, { kid: "other-key" }),
    jwt({}, { crit: ["b64"] }),
    jwt().replace(/.$/, "x"),
    "abc.def.ghi",
    "",
  ];
  for (const example of examples) {
    await assert.rejects(
      verifyAppleIdentityToken(example, keys, settings),
      { name: "AppleIdentityError" },
    );
  }
});

test("rejects wrong nonce digest or untrusted JWKS", async () => {
  await assert.rejects(verifyAppleIdentityToken(jwt(), keys, {
    ...settings, expectedNonceHash: "a".repeat(64),
  }));
  await assert.rejects(verifyAppleIdentityToken(jwt(), { keys: [] }, settings));
  await assert.rejects(verifyAppleIdentityToken(jwt(), {
    keys: [{ ...keys.keys[0]!, use: "enc" }],
  }, settings));
});

test("JWKS resolver accepts only Apple's pinned origin and rejects malformed data", async () => {
  let requested = "";
  const safeFetch = (async (input: string | URL | Request) => {
    requested = String(input);
    return new Response(JSON.stringify({ keys: keys.keys }), { status: 200 });
  }) as typeof fetch;
  assert.deepEqual(await fetchAppleJwks(safeFetch), keys);
  assert.equal(requested, APPLE_JWKS_URL);
  await assert.rejects(fetchAppleJwks((async () =>
    new Response(JSON.stringify({ keys: [{ kty: "oct", kid: "x" }] }), { status: 200 })
  ) as typeof fetch));
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hashSecret, verifySecret } from "../src/auth/tokenHash.js";

describe("token hashing", () => {
  it("hashes secrets with SHA-256 hex", () => {
    const hash = hashSecret("mote-secret");
    assert.equal(hash.length, 64);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.notEqual(hash, "mote-secret");
  });

  it("verifies a matching secret with a timing-safe compare", () => {
    const secret = "high-entropy-token";
    const hash = hashSecret(secret);
    assert.equal(verifySecret(secret, hash), true);
    assert.equal(verifySecret("other-token", hash), false);
  });

  it("does not treat a different-length hash as a match", () => {
    assert.equal(verifySecret("secret", "abcd"), false);
    assert.equal(verifySecret("secret", ""), false);
  });

  it("does not mutate or trim the incoming secret", () => {
    const secret = "  padded  ";
    const hash = hashSecret(secret);
    assert.equal(verifySecret("padded", hash), false);
    assert.equal(verifySecret(secret, hash), true);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SlidingWindowRateLimiter } from "../src/utils/rateLimit.js";

describe("rate limiter", () => {
  it("allows bursts up to the window limit", () => {
    const limiter = new SlidingWindowRateLimiter(10, 10_000);
    const now = 1_000_000;
    for (let index = 0; index < 10; index += 1) {
      assert.equal(limiter.consume("token-1", now + index), true);
    }
    assert.equal(limiter.consume("token-1", now + 9), false);
  });

  it("isolates keys from one another", () => {
    const limiter = new SlidingWindowRateLimiter(1, 10_000);
    assert.equal(limiter.consume("a", 1), true);
    assert.equal(limiter.consume("b", 1), true);
    assert.equal(limiter.consume("a", 2), false);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadConfig } from "../src/config/env.js";
import { loggerOptions, redactRequestUrl } from "../src/utils/logger.js";

describe("secret redaction", () => {
  it("strips secrets from request URLs", () => {
    assert.equal(
      redactRequestUrl("/v1/ws/pair?request_id=abc&pair_secret=super-secret"),
      "/v1/ws/pair?request_id=abc&pair_secret=[redacted]",
    );
    assert.equal(
      redactRequestUrl("/v1/devices/x/status?token=abc&credential=def"),
      "/v1/devices/x/status?token=[redacted]&credential=[redacted]",
    );
    assert.equal(redactRequestUrl("/v1/ws/pair"), "/v1/ws/pair");
  });

  it("redacts authorization, cookies, pairing secrets, and credentials", () => {
    const options = loggerOptions(loadConfig({ env: "development", logLevel: "info" }));
    assert.notEqual(options, false);
    if (options === false) {
      return;
    }
    const paths = options.redact.paths;
    for (const path of [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.body.pair_secret",
      "req.body.credential",
      "req.query.pair_secret",
      "pair_secret",
      "credential",
      "password",
    ]) {
      assert.equal(paths.includes(path), true, path);
    }
    assert.equal(
      options.serializers.req({ method: "GET", url: "/v1/ws/pair?pair_secret=visible" }).url,
      "/v1/ws/pair?pair_secret=[redacted]",
    );
  });
});

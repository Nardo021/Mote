import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  ADMIN_SSE_FALLBACK_POLL_MS,
  livePollInterval,
  parseAdminEventPayload,
} from "./topics.js";

describe("admin event payload", () => {
  it("parses known topics and ignores unknown ones", () => {
    assert.deepEqual(parseAdminEventPayload('{"topics":["devices"]}'), [
      "devices",
    ]);
    assert.deepEqual(
      parseAdminEventPayload('{"topics":["devices","nope","activity"]}'),
      ["devices", "activity"],
    );
    assert.equal(parseAdminEventPayload("{"), null);
    assert.equal(parseAdminEventPayload('{"topics":[]}'), null);
    assert.equal(parseAdminEventPayload('{"topics":["nope"]}'), null);
  });

  it("uses a 30s poll while SSE is live", () => {
    assert.equal(livePollInterval(true, 5_000), ADMIN_SSE_FALLBACK_POLL_MS);
    assert.equal(livePollInterval(false, 5_000), 5_000);
  });
});

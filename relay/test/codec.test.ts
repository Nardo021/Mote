import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseIncomingDeviceMessage } from "../src/protocol/codec.js";

describe("protocol codec", () => {
  it("parses a valid auth message", () => {
    const result = parseIncomingDeviceMessage(
      JSON.stringify({
        type: "auth",
        version: 1,
        device_id: "device-1",
        credential: "secret",
      }),
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.message.type, "auth");
    }
  });

  it("rejects malformed WebSocket JSON", () => {
    const result = parseIncomingDeviceMessage("not-json");
    assert.deepEqual(result, { ok: false, reason: "malformed_json" });
  });

  it("rejects unsupported protocol versions", () => {
    const result = parseIncomingDeviceMessage(
      JSON.stringify({ type: "auth", version: 2, device_id: "d", credential: "c" }),
    );
    assert.deepEqual(result, { ok: false, reason: "unsupported_version" });
  });

  it("ignores unknown message types as unknown_type", () => {
    const result = parseIncomingDeviceMessage(JSON.stringify({ type: "connected", version: 1 }));
    assert.deepEqual(result, { ok: false, reason: "unknown_type" });
  });
});

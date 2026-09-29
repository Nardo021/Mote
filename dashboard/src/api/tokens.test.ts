import assert from "node:assert/strict";
import { describe, it, vi } from "vitest";

import { createToken } from "./tokens.js";

describe("token api", () => {
  it("creates a token bound to one device and does not send a device list", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          id: "tok",
          name: "iPhone",
          permission: "send_command",
          client_kind: "shortcut",
          device_id: "11111111-1111-4111-8111-111111111111",
          enabled: true,
          created_at: 1,
          last_used_at: null,
          token: "shown-once",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const created = await createToken({
      name: "iPhone",
      clientKind: "shortcut",
      deviceId: "11111111-1111-4111-8111-111111111111",
    });
    assert.equal(created.token, "shown-once");
    assert.equal(created.device_id, "11111111-1111-4111-8111-111111111111");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    assert.equal(body.device_id, "11111111-1111-4111-8111-111111111111");
    assert.equal(body.device_ids, undefined);
    assert.equal(JSON.stringify(body).includes("shown-once"), false);
    vi.unstubAllGlobals();
  });
});

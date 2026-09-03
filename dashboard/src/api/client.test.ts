import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";

import { ApiError } from "../lib/errors.js";
import { apiRequest, setUnauthorizedHandler } from "./client.js";

afterEach(() => {
  setUnauthorizedHandler(undefined);
  vi.unstubAllGlobals();
});

describe("api client", () => {
  it("includes credentials and parses JSON", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await apiRequest<{ ok: boolean }>("/admin/api/system");
    assert.equal(result.ok, true);
    assert.equal(fetchMock.mock.calls[0]?.[1]?.credentials, "include");
  });

  it("notifies on 401 unless allowUnauthorized is set", async () => {
    let redirected = false;
    setUnauthorizedHandler(() => {
      redirected = true;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: { code: "UNAUTHORIZED", message: "no" } }),
            { status: 401 },
          ),
      ),
    );
    await assert.rejects(() => apiRequest("/admin/api/devices"), ApiError);
    assert.equal(redirected, true);

    redirected = false;
    await assert.rejects(
      () => apiRequest("/admin/api/session", { allowUnauthorized: true }),
      ApiError,
    );
    assert.equal(redirected, false);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  commandUrl,
  formatDuration,
  formatRelativeTime,
  lastCommandLabel,
  shortenId,
  shortcutSetupUrl,
  titleCaseAction,
} from "./format.js";
import { devicePresence, devicePresenceLabel } from "./status.js";
import { ApiError, friendlyError, parseApiError } from "./errors.js";

describe("format helpers", () => {
  it("formats relative time and duration", () => {
    const now = 1_000_000;
    assert.equal(formatRelativeTime(now, now), "Just now");
    assert.equal(formatRelativeTime(now - 12_000, now), "12 sec ago");
    assert.equal(formatRelativeTime(null), "—");
    assert.equal(formatDuration(38), "38 ms");
    assert.equal(formatDuration(null), "—");
  });

  it("shortens device ids and labels last commands", () => {
    assert.equal(
      shortenId("7b0f1234-aaaa-4111-8111-0000000091ac"),
      "7b0f…91ac",
    );
    assert.equal(
      lastCommandLabel({ action: "lock", status: "completed" }),
      "Lock · Completed",
    );
    assert.equal(titleCaseAction("lock"), "Lock");
  });

  it("builds public shortcut and command URLs without a token", () => {
    assert.equal(
      shortcutSetupUrl(
        "https://relay.yanze.me/",
        "7b0f1234-aaaa-4111-8111-0000000091ac",
      ),
      "https://relay.yanze.me/s/7b0f1234-aaaa-4111-8111-0000000091ac",
    );
    assert.equal(
      commandUrl(
        "https://relay.yanze.me",
        "7b0f1234-aaaa-4111-8111-0000000091ac",
      ),
      "https://relay.yanze.me/v1/devices/7b0f1234-aaaa-4111-8111-0000000091ac/commands",
    );
  });
});

describe("device status", () => {
  it("separates disabled from offline", () => {
    assert.equal(devicePresence({ enabled: false, online: false }), "disabled");
    assert.equal(devicePresence({ enabled: true, online: false }), "offline");
    assert.equal(devicePresence({ enabled: true, online: true }), "online");
    assert.equal(devicePresenceLabel("disabled"), "Disabled");
  });
});

describe("api errors", () => {
  it("maps known codes to friendly text", () => {
    const error = parseApiError(409, {
      error: {
        code: "DEVICE_OFFLINE",
        message: "Device is currently offline.",
      },
    });
    assert.equal(error.code, "DEVICE_OFFLINE");
    assert.equal(
      friendlyError(error, "fallback"),
      "Device is currently offline.",
    );
    assert.equal(
      friendlyError(new ApiError(401, "UNAUTHORIZED", "nope"), "fallback"),
      "Invalid username or password.",
    );
  });
});

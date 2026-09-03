import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { errorMessageKey } from "./errors.js";

describe("errorMessageKey", () => {
  it("maps known codes to i18n keys", () => {
    assert.equal(errorMessageKey("DEVICE_OFFLINE"), "errors.DEVICE_OFFLINE");
    assert.equal(errorMessageKey("COMMAND_TIMEOUT"), "errors.COMMAND_TIMEOUT");
    assert.equal(errorMessageKey("PERMISSION_REQUIRED"), "errors.PERMISSION_REQUIRED");
    assert.equal(errorMessageKey("UNKNOWN_CODE"), "errors.unknown");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { ApiError } from "./errors.js";
import {
  commandErrorCode,
  requireCompletedCommand,
} from "./commandResult.js";

describe("requireCompletedCommand", () => {
  it("returns completed results", () => {
    const result = {
      status: "completed",
      device_id: "dev_1",
      command_id: "cmd_1",
      duration_ms: 12,
    };
    assert.equal(requireCompletedCommand(result), result);
  });

  it("throws for permission_required instead of treating HTTP 200 as success", () => {
    assert.throws(
      () =>
        requireCompletedCommand({
          status: "permission_required",
          device_id: "dev_1",
          duration_ms: 8,
        }),
      (error: unknown) =>
        error instanceof ApiError && error.code === "PERMISSION_REQUIRED",
    );
  });

  it("maps terminal statuses to error codes", () => {
    assert.equal(commandErrorCode("timeout"), "COMMAND_TIMEOUT");
    assert.equal(commandErrorCode("failed"), "COMMAND_FAILED");
    assert.equal(commandErrorCode("unsupported"), "UNSUPPORTED_ACTION");
  });
});

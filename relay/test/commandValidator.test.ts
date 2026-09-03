import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseCommandBody, validateCommandAction } from "../src/commands/commandValidator.js";
import { AppError, ErrorCode } from "../src/utils/errors.js";

describe("command validator", () => {
  it("accepts the V1 lock action", () => {
    assert.equal(validateCommandAction("lock"), "lock");
  });

  it("rejects reserved and unknown actions", () => {
    for (const action of ["sleep", "mute", "unmute", "play_pause", "rm -rf /", "shell"]) {
      assert.throws(
        () => validateCommandAction(action),
        (error: unknown) => error instanceof AppError && error.code === ErrorCode.UNSUPPORTED_ACTION,
      );
    }
  });

  it("requires a JSON object with an action", () => {
    assert.throws(
      () => parseCommandBody(null),
      (error: unknown) => error instanceof AppError && error.code === ErrorCode.INVALID_REQUEST,
    );
    assert.deepEqual(parseCommandBody({ action: "lock" }), { action: "lock" });
  });
});

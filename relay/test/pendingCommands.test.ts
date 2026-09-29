import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { acceptCommandResult, PendingCommands } from "../src/commands/pendingCommands.js";
import type { CommandResultMessage } from "../src/protocol/messages.js";

const DEVICE_A = "11111111-1111-4111-8111-111111111111";
const DEVICE_B = "22222222-2222-4222-8222-222222222222";

function result(commandId: string, status: CommandResultMessage["status"] = "completed"): CommandResultMessage {
  return {
    type: "command_result",
    version: 1,
    command_id: commandId,
    status,
    completed_at: 30,
  };
}

describe("pending commands", () => {
  it("resolves when the target device submits a matching command_result", async () => {
    const pending = new PendingCommands();
    const waiter = pending.wait("cmd_1", DEVICE_A, 1_000, 10, 20);
    const resolved = pending.resolve(result("cmd_1"), DEVICE_A);
    assert.equal(resolved, "resolved");
    const outcome = await waiter;
    assert.equal(outcome.status, "completed");
    assert.equal(outcome.commandId, "cmd_1");
    assert.equal(pending.size, 0);
  });

  it("times out and cleans up expired pending commands", async () => {
    const pending = new PendingCommands();
    const outcome = await pending.wait("cmd_timeout", DEVICE_A, 20, 1, 2);
    assert.equal(outcome.status, "timeout");
    assert.equal(pending.size, 0);
  });

  it("ignores results for unknown command ids", () => {
    const pending = new PendingCommands();
    assert.equal(pending.resolve(result("missing"), DEVICE_A), "unknown");
  });

  it("does not let another device resolve, fail, or clear a pending command", async () => {
    const pending = new PendingCommands();
    const warnings: Array<Record<string, unknown>> = [];
    const waiter = pending.wait("cmd_owned", DEVICE_A, 1_000, 10, 20);
    const mismatch = acceptCommandResult(pending, result("cmd_owned", "failed"), DEVICE_B, {
      warn(obj) {
        warnings.push(obj);
      },
    });
    assert.equal(mismatch, "mismatch");
    assert.equal(pending.size, 1);
    assert.deepEqual(warnings, [{ device_id: DEVICE_B, command_id: "cmd_owned" }]);
    assert.equal(JSON.stringify(warnings).includes("pair_secret"), false);
    assert.equal(pending.resolve(result("cmd_owned"), DEVICE_A), "resolved");
    assert.equal((await waiter).status, "completed");
    assert.equal(pending.resolve(result("cmd_owned"), DEVICE_A), "unknown");
  });
});

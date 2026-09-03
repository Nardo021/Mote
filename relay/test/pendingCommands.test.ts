import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PendingCommands } from "../src/commands/pendingCommands.js";

describe("pending commands", () => {
  it("resolves when a matching command_result arrives", async () => {
    const pending = new PendingCommands();
    const waiter = pending.wait("cmd_1", 1_000, 10, 20);
    const resolved = pending.resolve({
      type: "command_result",
      version: 1,
      command_id: "cmd_1",
      status: "completed",
      completed_at: 30,
    });
    assert.equal(resolved, true);
    const outcome = await waiter;
    assert.equal(outcome.status, "completed");
    assert.equal(outcome.commandId, "cmd_1");
    assert.equal(pending.size, 0);
  });

  it("times out and cleans up expired pending commands", async () => {
    const pending = new PendingCommands();
    const outcome = await pending.wait("cmd_timeout", 20, 1, 2);
    assert.equal(outcome.status, "timeout");
    assert.equal(pending.size, 0);
  });

  it("ignores results for unknown command ids", () => {
    const pending = new PendingCommands();
    assert.equal(
      pending.resolve({
        type: "command_result",
        version: 1,
        command_id: "missing",
        status: "completed",
        completed_at: 1,
      }),
      false,
    );
  });
});

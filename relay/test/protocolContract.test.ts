import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { CommandSource } from "../src/commands/commandTypes.js";
import { DEVICE_WEBSOCKET_PATH, PAIR_WEBSOCKET_PATH } from "../src/config/constants.js";
import { CommandClientKind } from "../src/devices/tokenTypes.js";
import { ACTIVE_ACTIONS } from "../src/protocol/actions.js";
import { SocketClose } from "../src/protocol/closeReasons.js";
import { CommandResultStatus } from "../src/protocol/messages.js";
import { PROTOCOL_VERSION } from "../src/protocol/protocolVersion.js";
import { ErrorCode } from "../src/utils/errors.js";

const catalogue = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../protocol/catalogue.json"),
    "utf8",
  ),
) as {
  version: number;
  actions: string[];
  activitySources: string[];
  commandClientKinds: string[];
  paths: { deviceWebSocket: string; pairWebSocket: string };
  commandResultStatus: string[];
  closes: Array<{ reason: string; closeCode: number }>;
  httpErrors: Array<{ code: string }>;
};

function names(values: Record<string, string>): string[] {
  return Object.values(values).sort();
}

describe("canonical protocol catalogue", () => {
  it("owns the protocol version, actions, sources, and websocket paths", () => {
    assert.equal(PROTOCOL_VERSION, catalogue.version);
    assert.deepEqual([...ACTIVE_ACTIONS].sort(), [...catalogue.actions].sort());
    assert.deepEqual(names(CommandSource), [...catalogue.activitySources].sort());
    assert.deepEqual(names(CommandClientKind), [...catalogue.commandClientKinds].sort());
    assert.equal(DEVICE_WEBSOCKET_PATH, catalogue.paths.deviceWebSocket);
    assert.equal(PAIR_WEBSOCKET_PATH, catalogue.paths.pairWebSocket);
    assert.deepEqual(names(CommandResultStatus), [...catalogue.commandResultStatus].sort());
  });

  it("matches server close reasons and HTTP error codes", () => {
    const closes = Object.values(SocketClose)
      .map((close) => `${close.reason}:${close.code}`)
      .sort();
    const catalogued = catalogue.closes.map((close) => `${close.reason}:${close.closeCode}`).sort();
    assert.deepEqual(closes, catalogued);
    assert.deepEqual(names(ErrorCode), catalogue.httpErrors.map((error) => error.code).sort());
  });

  it("does not treat an unknown close reason as a catalogued reason", () => {
    const known = new Set<string>(Object.values(SocketClose).map((close) => close.reason));
    assert.equal(known.has("future_reason"), false);
    assert.equal(known.has("shutdown"), false);
  });
});

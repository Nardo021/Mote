import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { parseIncomingDeviceMessage, parsePairAuthMessage } from "../src/protocol/codec.js";

const protocolDir = join(dirname(fileURLToPath(import.meta.url)), "../../protocol");

type SchemaProp = {
  const?: unknown;
  enum?: unknown[];
  type?: string;
  items?: { enum?: unknown[] };
};

type SchemaDef = {
  required: string[];
  properties: Record<string, SchemaProp>;
};

type Schema = {
  $defs: Record<string, SchemaDef>;
};

type Manifest = {
  incoming: string[];
  pairing: string[];
  pairingOutgoing: string[];
  outgoing: string[];
  invalid: string[];
};

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function assertFrame(fixture: Record<string, unknown>, def: SchemaDef, label: string): void {
  for (const key of def.required) {
    assert.ok(key in fixture, `${label} missing ${key}`);
  }
  for (const key of Object.keys(fixture)) {
    assert.ok(key in def.properties, `${label} has undocumented key ${key}`);
    const property = def.properties[key];
    if (property === undefined) {
      continue;
    }
    const value = fixture[key];
    if (property.const !== undefined) {
      assert.deepEqual(value, property.const, `${label}.${key}`);
    }
    if (property.enum !== undefined) {
      assert.ok(property.enum.includes(value), `${label}.${key}`);
    }
    if (property.type === "string") {
      assert.equal(typeof value, "string", `${label}.${key}`);
    }
    if (property.type === "integer") {
      assert.equal(typeof value, "number", `${label}.${key}`);
    }
    if (property.type === "array") {
      assert.ok(Array.isArray(value), `${label}.${key}`);
      const allowed = property.items?.enum;
      if (Array.isArray(value) && allowed !== undefined) {
        for (const item of value) {
          assert.ok(allowed.includes(item), `${label}.${key}`);
        }
      }
    }
  }
  assert.equal(fixture.version, 1, label);
}

describe("shared protocol fixtures", () => {
  const schema = readJson(join(protocolDir, "mote-v1.schema.json")) as Schema;
  const manifest = readJson(join(protocolDir, "fixtures/manifest.json")) as Manifest;

  for (const name of manifest.incoming) {
    it(`parses incoming fixture ${name}`, () => {
      const fixture = readJson(join(protocolDir, "fixtures", name)) as Record<string, unknown>;
      const type = fixture.type;
      assert.equal(typeof type, "string");
      const def = schema.$defs[String(type)];
      assert.ok(def, `schema missing ${String(type)}`);
      assertFrame(fixture, def, name);
      const parsed = parseIncomingDeviceMessage(JSON.stringify(fixture));
      assert.equal(parsed.ok, true, name);
      if (parsed.ok) {
        assert.equal(parsed.message.type, type);
      }
    });
  }

  for (const name of manifest.pairing) {
    it(`parses pairing fixture ${name} outside the device channel`, () => {
      const fixture = readJson(join(protocolDir, "fixtures", name)) as Record<string, unknown>;
      const type = fixture.type;
      assert.equal(typeof type, "string");
      const def = schema.$defs[String(type)];
      assert.ok(def, `schema missing ${String(type)}`);
      assertFrame(fixture, def, name);
      const parsed = parsePairAuthMessage(JSON.stringify(fixture));
      assert.equal(parsed.ok, true, name);
      const onDeviceChannel = parseIncomingDeviceMessage(JSON.stringify(fixture));
      assert.equal(onDeviceChannel.ok, false);
    });
  }

  for (const name of [...manifest.outgoing, ...manifest.pairingOutgoing]) {
    it(`matches fixture ${name} to the schema`, () => {
      const fixture = readJson(join(protocolDir, "fixtures", name)) as Record<string, unknown>;
      const type = fixture.type;
      assert.equal(typeof type, "string");
      const def = schema.$defs[String(type)];
      assert.ok(def, `schema missing ${String(type)}`);
      assertFrame(fixture, def, name);
    });
  }

  it("rejects a version the schema does not define", () => {
    const fixture = readJson(join(protocolDir, "fixtures/invalid/auth-version.json"));
    const parsed = parseIncomingDeviceMessage(JSON.stringify(fixture));
    assert.deepEqual(parsed, { ok: false, reason: "unsupported_version" });
  });

  it("rejects an action that is not in Protocol v1", () => {
    const fixture = readJson(join(protocolDir, "fixtures/invalid/auth-unknown-action.json"));
    const parsed = parseIncomingDeviceMessage(JSON.stringify(fixture));
    assert.deepEqual(parsed, { ok: false, reason: "invalid_message" });
  });
});

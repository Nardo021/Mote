import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import test from "node:test";

import type { CloudD1Database, CloudD1Statement } from "../src/cloud/identityRepository.js";
import { CloudIdentityRepository } from "../src/cloud/identityRepository.js";
import {
  CloudTenantRealtime,
  type CloudRealtimeSocket,
  type CloudSocketAttachment,
} from "../src/cloud/realtimeCore.js";
import {
  createCloudStagingHandler,
  type CloudStagingEnv,
} from "../src/cloud/stagingWorker.js";

const nowMs = 1_800_000_000_000;
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const DA = "44444444-4444-4444-8444-444444444444";
const DA2 = "55555555-5555-4555-8555-555555555555";
const DB = "66666666-6666-4666-8666-666666666666";
const GA = randomBytes(32).toString("base64url");
const GA2 = randomBytes(32).toString("base64url");
const GB = randomBytes(32).toString("base64url");

function sha256(raw: string) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}
class Statement implements CloudD1Statement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly args: SQLInputValue[] = [],
  ) {}
  bind(...args: Array<string | number | null>) { return new Statement(this.db, this.sql, args); }
  async first<T>() { return (this.db.prepare(this.sql).get(...this.args) ?? null) as T | null; }
  async all<T>() { return { results: this.db.prepare(this.sql).all(...this.args) as T[] }; }
  async run() {
    const result = this.db.prepare(this.sql).run(...this.args);
    return { meta: { changes: Number(result.changes) } };
  }
}
function fixture() {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  for (const file of ["0001_core.sql", "0002_auth.sql", "0003_pairing_claim.sql"]) {
    raw.exec(readFileSync(new URL(`../../cloud/migrations/${file}`, import.meta.url), "utf8"));
  }
  const db: CloudD1Database = { prepare: (sql) => new Statement(raw, sql) };
  for (const [account, subject] of [[A, "apple-a"], [B, "apple-b"]]) {
    raw.prepare("INSERT INTO cloud_accounts(id, apple_subject, created_at_ms) VALUES (?, ?, ?)").run(
      account, subject, nowMs,
    );
  }
  const insert = raw.prepare(
    `INSERT INTO cloud_devices(id, owner_account_id, name, platform, credential_hash,
      created_at_ms, updated_at_ms) VALUES (?, ?, ?, 'windows', ?, ?, ?)`,
  );
  insert.run(DA, A, "A PC", sha256(GA), nowMs, nowMs);
  insert.run(DA2, A, "A second PC", sha256(GA2), nowMs, nowMs);
  insert.run(DB, B, "B PC", sha256(GB), nowMs, nowMs);
  return { raw, db };
}

class MockSocket implements CloudRealtimeSocket {
  attachment: CloudSocketAttachment | null = null;
  readonly sent: string[] = [];
  readonly closed: Array<{ code?: number; reason?: string }> = [];
  send(data: string): void { this.sent.push(data); }
  close(code?: number, reason?: string): void {
    this.closed.push({ ...(code === undefined ? {} : { code }), ...(reason === undefined ? {} : { reason }) });
  }
  serializeAttachment(value: CloudSocketAttachment): void { this.attachment = value; }
  deserializeAttachment(): CloudSocketAttachment | null { return this.attachment; }
  last<T>(): T { return JSON.parse(this.sent.at(-1)!) as T; }
}

async function socketFor(hub: CloudTenantRealtime, deviceId: string, credential: string) {
  const socket = new MockSocket();
  hub.accept(socket, deviceId);
  await hub.onMessage(socket, JSON.stringify({
    type: "auth", version: 1, device_id: deviceId,
    credential, platform: "windows", actions: ["lock"],
  }));
  return socket;
}
async function flushUntil(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 20 && !predicate(); i++) {
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  assert.ok(predicate(), "expected asynchronous command frame to be issued");
}

test("authenticated Protocol v1 device receives owner lock and matching result completes it", async () => {
  const { raw, db } = fixture();
  try {
    const identity = new CloudIdentityRepository(db);
    const tokens = await identity.issueSession(A, nowMs);
    const hub = new CloudTenantRealtime(db, A, () => nowMs);
    const device = await socketFor(hub, DA, GA);
    assert.deepEqual(device.last(), { type: "auth_result", version: 1, status: "ok" });

    await hub.onMessage(device, JSON.stringify({
      type: "heartbeat", version: 1, device_id: DA, sent_at: nowMs,
    }));
    assert.deepEqual(device.last(), {
      type: "heartbeat_ack", version: 1, sent_at: nowMs, server_at: nowMs,
    });

    const result = hub.command(tokens.accessToken, DA, "lock");
    await flushUntil(() => device.sent.some(item => JSON.parse(item).type === "command"));
    const command = device.last<{ type: string; id: string; action: string; device_id: string; expires_at: number }>();
    assert.equal(command.type, "command");
    assert.equal(command.action, "lock");
    assert.equal(command.device_id, DA);
    assert.equal(command.expires_at, nowMs + 10_000);

    await hub.onMessage(device, JSON.stringify({
      type: "command_result", version: 1, command_id: command.id,
      status: "completed", completed_at: nowMs + 1_000,
    }));
    assert.deepEqual(await result, {
      httpStatus: 200, status: "completed", commandId: command.id,
    });
  } finally { raw.close(); }
});

test("cross-account command and fake credentials never send a device frame", async () => {
  const { raw, db } = fixture();
  try {
    const identity = new CloudIdentityRepository(db);
    const b = await identity.issueSession(B, nowMs);
    const a = await identity.issueSession(A, nowMs);
    const hub = new CloudTenantRealtime(db, A, () => nowMs);
    const fake = await socketFor(hub, DA, GB);
    assert.equal(fake.closed.at(-1)?.code, 4401);
    assert.equal(fake.sent.length, 0);
    const actual = await socketFor(hub, DA, GA);
    assert.deepEqual(await hub.command(b.accessToken, DA, "lock"), {
      httpStatus: 404, status: "failed",
    });
    assert.deepEqual(await hub.command(a.accessToken, DB, "lock"), {
      httpStatus: 404, status: "failed",
    });
    assert.deepEqual(await hub.command(a.accessToken, DA, "unlock"), {
      httpStatus: 422, status: "failed",
    });
    assert.equal(actual.sent.filter(line => JSON.parse(line).type === "command").length, 0);
  } finally { raw.close(); }
});

test("offline commands are never queued, even if a device reconnects later", async () => {
  const { raw, db } = fixture();
  try {
    const identity = new CloudIdentityRepository(db);
    const a = await identity.issueSession(A, nowMs);
    const hub = new CloudTenantRealtime(db, A, () => nowMs);
    assert.deepEqual(await hub.command(a.accessToken, DA, "lock"), {
      httpStatus: 409, status: "offline",
    });
    const socket = await socketFor(hub, DA, GA);
    assert.equal(socket.sent.filter(line => JSON.parse(line).type === "command").length, 0);
    hub.onClose(socket);
    assert.deepEqual(await hub.command(a.accessToken, DA, "lock"), {
      httpStatus: 409, status: "offline",
    });
  } finally { raw.close(); }
});

test("a different device cannot forge another device's command result", async () => {
  const { raw, db } = fixture();
  try {
    const identity = new CloudIdentityRepository(db);
    const a = await identity.issueSession(A, nowMs);
    const hub = new CloudTenantRealtime(db, A, () => nowMs);
    const one = await socketFor(hub, DA, GA);
    const two = await socketFor(hub, DA2, GA2);
    const pending = hub.command(a.accessToken, DA, "lock");
    await flushUntil(() => one.sent.some(item => JSON.parse(item).type === "command"));
    const command = one.last<{ id: string }>();
    let settled = false;
    void pending.then(() => { settled = true; });
    await hub.onMessage(two, JSON.stringify({
      type: "command_result", version: 1, command_id: command.id,
      completed_at: nowMs + 500, status: "completed",
    }));
    assert.equal(settled, false);
    await hub.onMessage(one, JSON.stringify({
      type: "command_result", version: 1, command_id: command.id,
      completed_at: nowMs + 800, status: "completed",
    }));
    assert.equal((await pending).status, "completed");
  } finally { raw.close(); }
});

test("revocation and credential rotation fail closed for existing and restored sockets", async () => {
  const { raw, db } = fixture();
  try {
    const identity = new CloudIdentityRepository(db);
    const a = await identity.issueSession(A, nowMs);
    const hub = new CloudTenantRealtime(db, A, () => nowMs);
    const ws = await socketFor(hub, DA, GA);
    const restored = new CloudTenantRealtime(db, A, () => nowMs);
    restored.restore(ws);
    assert.equal((await restored.command(a.accessToken, DA, "lock")).status === "timeout", false);
  } finally { raw.close(); }
});

test("heartbeat rejects credential rotation and disabled accounts on restored sockets", async () => {
  const { raw, db } = fixture();
  try {
    const hub = new CloudTenantRealtime(db, A, () => nowMs);
    const socket = await socketFor(hub, DA, GA);
    const afterRestart = new CloudTenantRealtime(db, A, () => nowMs);
    afterRestart.restore(socket);
    raw.prepare("UPDATE cloud_devices SET credential_hash = ? WHERE id = ?").run(sha256("new-secret"), DA);
    await afterRestart.onMessage(socket, JSON.stringify({
      type: "heartbeat", version: 1, device_id: DA, sent_at: nowMs,
    }));
    assert.equal(socket.closed.at(-1)?.code, 4401);
    const socket2 = await socketFor(hub, DA2, GA2);
    raw.prepare("UPDATE cloud_accounts SET status = 'disabled' WHERE id = ?").run(A);
    await hub.onMessage(socket2, JSON.stringify({
      type: "heartbeat", version: 1, device_id: DA2, sent_at: nowMs,
    }));
    assert.equal(socket2.closed.at(-1)?.code, 4401);
  } finally { raw.close(); }
});

test("expired command results cannot convert timed-out locks into success", async () => {
  const { raw, db } = fixture();
  let clock = nowMs;
  try {
    const identity = new CloudIdentityRepository(db);
    const a = await identity.issueSession(A, nowMs);
    const hub = new CloudTenantRealtime(db, A, () => clock);
    const socket = await socketFor(hub, DA, GA);
    const pending = hub.command(a.accessToken, DA, "lock");
    await flushUntil(() => socket.sent.some(line => JSON.parse(line).type === "command"));
    const command = socket.last<{ id: string }>();
    clock += 10_001;
    await hub.onMessage(socket, JSON.stringify({
      type: "command_result", version: 1, command_id: command.id,
      completed_at: clock, status: "completed",
    }));
    assert.deepEqual(await pending, {
      httpStatus: 504, status: "timeout", commandId: command.id,
    });
  } finally { raw.close(); }
});

test("gateway derives provisional WS tenant and lock tenant from D1 only", async () => {
  const { raw, db } = fixture();
  try {
    const identity = new CloudIdentityRepository(db);
    const a = await identity.issueSession(A, nowMs);
    const b = await identity.issueSession(B, nowMs);
    const captured: Array<{ key: string; request: Request; body?: unknown }> = [];
    const namespace = {
      idFromName: (name: string) => name,
      get(key: unknown) {
        return {
          async fetch(request: Request): Promise<Response> {
            captured.push({ key: String(key), request, ...(request.method === "POST" ? { body: await request.json() } : {}) });
            return new Response(JSON.stringify({ status: "offline" }), { status: 409 });
          },
        };
      },
    };
    const gate = "not-a-client-credential-staging-only-0123456";
    const internal = "server-to-durable-object-secret-only-123456";
    const env: CloudStagingEnv = {
      CLOUD_DB: db, CLOUD_TENANTS: namespace,
      MOTE_CLOUD_STAGING_ENABLED: "true", MOTE_CLOUD_STAGING_GATE: gate,
      MOTE_CLOUD_INTERNAL_SECRET: internal,
      APPLE_CLIENT_ID: "com.nardo021.mote.testing",
    };
    const handler = createCloudStagingHandler({ now: () => nowMs });

    const command = (token: string, deviceId: string, action = "lock") => handler(
      new Request(`https://staging.test/cloud/v1/devices/${deviceId}/commands`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Mote-Staging-Gate": gate,
          "X-Mote-Cloud-Owner": B,
          "X-Mote-Cloud-Internal": "forged-value",
        },
        body: JSON.stringify({ action, tenantAccountId: B }),
      }), env,
    );

    assert.equal((await command(b.accessToken, DA)).status, 404);
    assert.equal(captured.length, 0);
    assert.equal((await command(a.accessToken, DA, "unlock")).status, 422);
    assert.equal(captured.length, 0);
    assert.equal((await command(a.accessToken, DA)).status, 409);
    assert.equal(captured.length, 1);
    assert.equal(captured[0]?.key, `mote-cloud-account:${A}`);
    assert.equal(captured[0]?.request.headers.get("X-Mote-Cloud-Owner"), A);
    assert.equal(captured[0]?.request.headers.get("X-Mote-Cloud-Internal"), internal);
    assert.deepEqual(captured[0]?.body, {
      accessToken: a.accessToken, deviceId: DA, action: "lock",
    });

    const ws = await handler(new Request(
      `https://staging.test/cloud/v1/ws/device/${DA}`, {
        method: "GET", headers: {
          "Upgrade": "websocket", "X-Mote-Staging-Gate": gate,
          "X-Mote-Cloud-Owner": B, "X-Mote-Cloud-Internal": "forged-value",
        },
      }), env);
    assert.equal(ws.status, 409); // mocked internal endpoint, no real upgrade
    assert.equal(captured[1]?.key, `mote-cloud-account:${A}`);
    assert.equal(captured[1]?.request.headers.get("X-Mote-Cloud-Owner"), A);
    assert.equal(captured[1]?.request.headers.get("X-Mote-Cloud-Internal"), internal);
    assert.equal(captured[1]?.request.headers.get("X-Mote-Staging-Gate"), null);
    assert.equal(captured[1]?.request.url.endsWith(`/internal/ws/${DA}`), true);

    // Unknown devices cannot choose an arbitrary tenant by guessing owner IDs.
    const unknown = await handler(new Request(
      "https://staging.test/cloud/v1/ws/device/88888888-8888-4888-8888-888888888888", {
        headers: { Upgrade: "websocket", "X-Mote-Staging-Gate": gate },
      }), env);
    assert.equal(unknown.status, 404);
    assert.equal(captured.length, 2);
  } finally { raw.close(); }
});

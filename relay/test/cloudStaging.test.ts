import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import test from "node:test";

import type { AppleJwks } from "../src/cloud/appleIdentity.js";
import type { CloudD1Database, CloudD1Statement } from "../src/cloud/identityRepository.js";
import {
  createCloudStagingHandler,
  type CloudStagingEnv,
} from "../src/cloud/stagingWorker.js";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const exported = publicKey.export({ format: "jwk" });
const jwks: AppleJwks = { keys: [{
  kid: "test-key", kty: "RSA", alg: "RS256", use: "sig", n: exported.n!, e: exported.e!,
}] };
const nowMs = 1_800_000_000_000;
const audience = "com.nardo021.mote.testing.ios";
const gate = "test-only-private-staging-gate-not-for-apps";
const db1 = readFileSync(new URL("../../cloud/migrations/0001_core.sql", import.meta.url), "utf8");
const db2 = readFileSync(new URL("../../cloud/migrations/0002_auth.sql", import.meta.url), "utf8");
const db3 = readFileSync(new URL("../../cloud/migrations/0003_pairing_claim.sql", import.meta.url), "utf8");

class SqliteStatement implements CloudD1Statement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly args: SQLInputValue[] = [],
  ) {}
  bind(...values: Array<string | number | null>): CloudD1Statement {
    return new SqliteStatement(this.db, this.sql, values);
  }
  async first<T>(): Promise<T | null> {
    return (this.db.prepare(this.sql).get(...this.args) ?? null) as T | null;
  }
  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.db.prepare(this.sql).all(...this.args) as T[] };
  }
  async run(): Promise<{ meta: { changes: number } }> {
    const result = this.db.prepare(this.sql).run(...this.args);
    return { meta: { changes: Number(result.changes) } };
  }
}
function newDb(): { raw: DatabaseSync; binding: CloudD1Database } {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  raw.exec(db1);
  raw.exec(db2);
  raw.exec(db3);
  return { raw, binding: { prepare: (sql) => new SqliteStatement(raw, sql) } };
}

function appleToken(nonce: string, subject: string): string {
  const header = Buffer.from(JSON.stringify({ kid: "test-key", alg: "RS256" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: "https://appleid.apple.com", aud: audience, sub: subject,
    iat: Math.floor(nowMs / 1_000) - 20, exp: Math.floor(nowMs / 1_000) + 600,
    nonce,
  })).toString("base64url");
  const message = `${header}.${payload}`;
  return `${message}.${sign("RSA-SHA256", Buffer.from(message), privateKey).toString("base64url")}`;
}

function harness() {
  const { raw, binding } = newDb();
  const env: CloudStagingEnv = {
    CLOUD_DB: binding,
    MOTE_CLOUD_STAGING_ENABLED: "true",
    MOTE_CLOUD_STAGING_GATE: gate,
    APPLE_CLIENT_ID: audience,
  };
  const handler = createCloudStagingHandler({ now: () => nowMs, jwks: async () => jwks });
  async function request(
    path: string, method = "GET", body?: unknown, token?: string, customGate?: string,
  ): Promise<{ status: number; body: any }> {
    const response = await handler(new Request(`https://staging.mote.test${path}`, {
      method,
      headers: {
        "X-Mote-Staging-Gate": customGate ?? gate,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), env);
    const result = await response.text();
    return { status: response.status, body: result ? JSON.parse(result) as unknown : null };
  }
  async function signIn(subject: string) {
    const challenge = await request("/cloud/v1/auth/challenge", "POST");
    assert.equal(challenge.status, 201);
    const login = await request("/cloud/v1/auth/apple", "POST", {
      challengeId: challenge.body.challengeId,
      identityToken: appleToken(challenge.body.nonce, subject),
    });
    assert.equal(login.status, 200);
    return { login: login.body, challenge };
  }
  return { raw, env, handler, request, signIn };
}

test("staging Worker fails closed if not explicitly enabled or gate is invalid", async () => {
  const { raw, env, handler, request } = harness();
  try {
    assert.equal((await request("/cloud/v1/health", "GET", undefined, undefined, "invalid")).status, 503);
    const response = await handler(new Request("https://staging.mote.test/cloud/v1/health", {
      headers: { "X-Mote-Staging-Gate": gate },
    }), { ...env, MOTE_CLOUD_STAGING_ENABLED: "false" });
    assert.equal(response.status, 503);
    assert.deepEqual(await request("/cloud/v1/health"), {
      status: 200, body: { service: "mote-cloud", status: "staging" },
    });
    assert.equal((await request("/cloud/v1/devices")).status, 401);
    assert.equal((await request("/cloud/v1/pairings", "POST", {})).status, 404);
  } finally { raw.close(); }
});

test("Apple identity registers once and consumes its server nonce exactly once", async () => {
  const { raw, request, signIn } = harness();
  try {
    const { login, challenge } = await signIn("apple-subject-user-a");
    assert.equal(typeof login.accountId, "string");
    assert.equal(typeof login.accessToken, "string");
    const replay = await request("/cloud/v1/auth/apple", "POST", {
      challengeId: challenge.body.challengeId,
      identityToken: appleToken(challenge.body.nonce, "apple-subject-user-a"),
    });
    assert.equal(replay.status, 401);
    const second = await signIn("apple-subject-user-a");
    assert.equal(second.login.accountId, login.accountId);
    assert.equal(
      (raw.prepare("SELECT count(*) AS n FROM cloud_accounts").get() as { n: number }).n,
      1,
    );
    const me = await request("/cloud/v1/me", "GET", undefined, login.accessToken);
    assert.deepEqual(me, { status: 200, body: { accountId: login.accountId } });
  } finally { raw.close(); }
});

test("a wrong Apple subject cannot view another account's devices", async () => {
  const { raw, request, signIn } = harness();
  try {
    const a = (await signIn("apple-subject-a")).login;
    const b = (await signIn("apple-subject-b")).login;
    assert.notEqual(a.accountId, b.accountId);
    raw.prepare(
      `INSERT INTO cloud_devices
       (id, owner_account_id, name, platform, credential_hash, created_at_ms, updated_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "44444444-4444-4444-8444-444444444444", a.accountId,
      "Alice PC", "windows", "f".repeat(64), nowMs, nowMs,
    );
    const listA = await request("/cloud/v1/devices", "GET", undefined, a.accessToken);
    const listB = await request("/cloud/v1/devices", "GET", undefined, b.accessToken);
    assert.equal(listA.status, 200);
    assert.equal(listA.body.devices.length, 1);
    assert.deepEqual(listB, { status: 200, body: { devices: [] } });
    assert.equal(JSON.stringify(listA.body).includes("credential_hash"), false);
  } finally { raw.close(); }
});

test("refresh rotation invalidates old credentials, logout revokes, disabled account fails closed", async () => {
  const { raw, request, signIn } = harness();
  try {
    const { login } = await signIn("apple-subject-a");
    const refreshed = await request("/cloud/v1/session/refresh", "POST", {
      refreshToken: login.refreshToken,
    });
    assert.equal(refreshed.status, 200);
    assert.notEqual(refreshed.body.accessToken, login.accessToken);
    assert.equal((await request("/cloud/v1/me", "GET", undefined, login.accessToken)).status, 401);
    assert.equal((await request("/cloud/v1/session/refresh", "POST", {
      refreshToken: login.refreshToken,
    })).status, 401);
    assert.equal((await request("/cloud/v1/me", "GET", undefined, refreshed.body.accessToken)).status, 200);
    const logout = await request("/cloud/v1/session/logout", "POST", undefined, refreshed.body.accessToken);
    assert.equal(logout.status, 204);
    assert.equal((await request("/cloud/v1/me", "GET", undefined, refreshed.body.accessToken)).status, 401);
    const another = (await signIn("apple-subject-a")).login;
    raw.prepare("UPDATE cloud_accounts SET status = 'disabled' WHERE id = ?").run(another.accountId);
    assert.equal((await request("/cloud/v1/me", "GET", undefined, another.accessToken)).status, 401);
  } finally { raw.close(); }
});

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function desktopRegistration(deviceId = "44444444-4444-4444-8444-444444444444") {
  const deviceSecret = "desktop-device-credential-" + "d".repeat(43);
  const pollSecret = "desktop-only-poll-secret-" + "p".repeat(43);
  return {
    pollSecret,
    registration: {
      deviceId,
      deviceName: "Mote Test Windows",
      platform: "windows",
      deviceCredentialHash: sha256(deviceSecret),
      pollSecretHash: sha256(pollSecret),
    },
  };
}

test("desktop creates QR; signed-in iOS user previews and approves; only owner sees device", async () => {
  const { raw, request, signIn } = harness();
  try {
    const a = (await signIn("owner-a")).login;
    const b = (await signIn("owner-b")).login;
    const desktop = desktopRegistration();
    const created = await request("/cloud/v1/pairings", "POST", desktop.registration);
    assert.equal(created.status, 201);
    const { ticketId, claimSecret, verificationCode } = created.body;
    assert.equal(typeof claimSecret, "string");
    assert.match(verificationCode, /^\d{6}$/);
    assert.equal((await request(`/cloud/v1/pairings/${ticketId}/preview`, "POST", {
      claimSecret: "wrong-secret-" + "a".repeat(43),
    }, a.accessToken)).status, 404);
    assert.equal((await request(`/cloud/v1/pairings/${ticketId}/preview`, "POST", {
      claimSecret,
    })).status, 401);

    const preview = await request(`/cloud/v1/pairings/${ticketId}/preview`, "POST", {
      claimSecret,
    }, a.accessToken);
    assert.equal(preview.status, 200);
    assert.equal(preview.body.verificationCode, verificationCode);
    assert.equal(preview.body.deviceName, desktop.registration.deviceName);
    assert.equal((await request(`/cloud/v1/pairings/${ticketId}/approve`, "POST", {
      claimSecret, confirmedCode: "000000" === verificationCode ? "999999" : "000000",
    }, a.accessToken)).status, 400);

    const approved = await request(`/cloud/v1/pairings/${ticketId}/approve`, "POST", {
      claimSecret, confirmedCode: verificationCode,
    }, a.accessToken);
    assert.deepEqual(approved, { status: 200, body: { status: "approved" } });
    assert.equal((await request(`/cloud/v1/pairings/${ticketId}/status`, "POST", {
      pollSecret: desktop.pollSecret,
    })).body.status, "approved");
    assert.equal((await request(`/cloud/v1/pairings/${ticketId}/status`, "POST", {
      pollSecret: "other-secret-" + "x".repeat(43),
    })).status, 404);
    const listA = await request("/cloud/v1/devices", "GET", undefined, a.accessToken);
    const listB = await request("/cloud/v1/devices", "GET", undefined, b.accessToken);
    assert.equal(listA.body.devices.length, 1);
    assert.equal(listB.body.devices.length, 0);
    assert.equal(listA.body.devices[0].id, desktop.registration.deviceId);
    assert.equal(JSON.stringify(listA.body).includes("hash"), false);
    const hashRow = raw.prepare("SELECT credential_hash FROM cloud_devices WHERE id = ?")
      .get(desktop.registration.deviceId) as { credential_hash: string };
    assert.equal(hashRow.credential_hash, desktop.registration.deviceCredentialHash);
    assert.equal(JSON.stringify(created.body).includes(desktop.registration.deviceCredentialHash), false);
  } finally { raw.close(); }
});

test("two accounts racing for same QR have one winner; replay never transfers ownership", async () => {
  const { raw, request, signIn } = harness();
  try {
    const a = (await signIn("race-a")).login;
    const b = (await signIn("race-b")).login;
    const desktop = desktopRegistration();
    const created = await request("/cloud/v1/pairings", "POST", desktop.registration);
    assert.equal(created.status, 201);
    const path = `/cloud/v1/pairings/${created.body.ticketId}/approve`;
    const proof = {
      claimSecret: created.body.claimSecret,
      confirmedCode: created.body.verificationCode,
    };
    const [first, second] = await Promise.all([
      request(path, "POST", proof, a.accessToken),
      request(path, "POST", proof, b.accessToken),
    ]);
    assert.equal([first.status, second.status].filter(x => x === 200).length, 1);
    assert.equal([first.status, second.status].filter(x => x !== 200).length, 1);
    const row = raw.prepare(
      "SELECT owner_account_id FROM cloud_devices WHERE id = ?",
    ).get(desktop.registration.deviceId) as { owner_account_id: string };
    assert.ok(row.owner_account_id === a.accountId || row.owner_account_id === b.accountId);
    assert.equal((await request(path, "POST", proof, a.accessToken)).status, 404);
    assert.equal((await request(path, "POST", proof, b.accessToken)).status, 404);
    assert.equal((await request("/cloud/v1/pairings", "POST", desktop.registration)).status, 409);
    assert.equal(
      (raw.prepare("SELECT count(*) AS n FROM cloud_devices").get() as { n: number }).n, 1,
    );
  } finally { raw.close(); }
});

test("expired ticket, malformed data and credential collisions do not create orphan devices", async () => {
  const { raw, request, signIn } = harness();
  try {
    const a = (await signIn("expiration-owner")).login;
    const first = desktopRegistration();
    const created = await request("/cloud/v1/pairings", "POST", first.registration);
    assert.equal(created.status, 201);
    const expiredAt = nowMs - 1;
    raw.prepare("UPDATE cloud_pairing_tickets SET expires_at_ms = ? WHERE id = ?")
      .run(expiredAt, created.body.ticketId);
    const approve = await request(`/cloud/v1/pairings/${created.body.ticketId}/approve`, "POST", {
      claimSecret: created.body.claimSecret,
      confirmedCode: created.body.verificationCode,
    }, a.accessToken);
    assert.equal(approve.status, 404);
    assert.deepEqual(await request(`/cloud/v1/pairings/${created.body.ticketId}/status`, "POST", {
      pollSecret: first.pollSecret,
    }), { status: 200, body: { status: "expired" } });

    const replacement = await request("/cloud/v1/pairings", "POST", first.registration);
    assert.equal(replacement.status, 201);
    const approved = await request(`/cloud/v1/pairings/${replacement.body.ticketId}/approve`, "POST", {
      claimSecret: replacement.body.claimSecret, confirmedCode: replacement.body.verificationCode,
    }, a.accessToken);
    assert.equal(approved.status, 200);

    const collision = desktopRegistration("55555555-5555-4555-8555-555555555555");
    const duplicateHash = await request("/cloud/v1/pairings", "POST", {
      ...collision.registration,
      deviceCredentialHash: first.registration.deviceCredentialHash,
    });
    assert.equal(duplicateHash.status, 201);
    const rejected = await request(`/cloud/v1/pairings/${duplicateHash.body.ticketId}/approve`, "POST", {
      claimSecret: duplicateHash.body.claimSecret,
      confirmedCode: duplicateHash.body.verificationCode,
    }, a.accessToken);
    assert.equal(rejected.status, 409);
    assert.equal(
      (raw.prepare("SELECT status FROM cloud_pairing_tickets WHERE id = ?")
        .get(duplicateHash.body.ticketId) as { status: string }).status,
      "pending",
    );
    assert.equal(
      (raw.prepare("SELECT count(*) AS n FROM cloud_devices").get() as { n: number }).n, 1,
    );

    assert.equal((await request("/cloud/v1/pairings", "POST", {
      ...collision.registration, deviceCredentialHash: "short",
    })).status, 409);
    assert.equal((await request("/cloud/v1/pairings", "POST", {
      ...collision.registration, platform: "linux",
    })).status, 400);
  } finally { raw.close(); }
});

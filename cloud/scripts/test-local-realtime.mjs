#!/usr/bin/env node
/**
 * LOCAL workerd + D1 + Durable Object + Protocol v1 integration test.
 * No remote Cloudflare API calls, Apple login or physical OS locking.
 * A private temporary database and two synthetic account sessions are used.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const config = "cloud/wrangler.integration.ci.jsonc";
const wrangler = join(root, "node_modules/wrangler/bin/wrangler.js");
const devVars = join(root, "cloud/.dev.vars");
const state = mkdtempSync(join(tmpdir(), "mote-cloud-ci-"));
const port = 8798;
const base = `http://127.0.0.1:${port}`;
const gate = randomBytes(32).toString("base64url");
const internal = randomBytes(32).toString("base64url");
const tokenA = randomBytes(32).toString("base64url");
const tokenB = randomBytes(32).toString("base64url");
const credentialA = randomBytes(32).toString("base64url");
const credentialB = randomBytes(32).toString("base64url");
const A = randomUUID(), B = randomUUID(), DA = randomUUID(), DB = randomUUID();
const now = Date.now();
const hash = value => createHash("sha256").update(value).digest("hex");
let worker;
let createdVars = false;
let workerOutput = "";
const env = {
  ...process.env,
  CLOUDFLARE_API_TOKEN: "",
  CLOUDFLARE_ACCOUNT_ID: "",
  WRANGLER_SEND_METRICS: "false",
  CI: "true",
};
function cli(args) {
  const result = spawnSync(process.execPath, [wrangler, ...args], {
    cwd: root, env, encoding: "utf8", maxBuffer: 8_000_000, timeout: 60_000,
  });
  if (result.status !== 0) {
    // Never print generated credentials or fixture SQL.
    throw new Error(`Local Wrangler command failed: ${args.slice(0, 3).join(" ")}: ${(result.stderr ?? "").slice(-1300)}`);
  }
}
function wsFrame(value, opcode = 1) {
  const payload = Buffer.from(opcode === 1 ? JSON.stringify(value) : "");
  assert.ok(payload.length < 65536);
  const size = payload.length < 126 ? 2 : 4;
  const header = Buffer.alloc(size);
  header[0] = 0x80 | opcode;
  header[1] = 0x80 | (size === 2 ? payload.length : 126);
  if (size === 4) header.writeUInt16BE(payload.length, 2);
  const mask = randomBytes(4);
  const masked = Buffer.from(payload);
  for (let i = 0; i < payload.length; i++) masked[i] ^= mask[i % 4];
  return Buffer.concat([header, mask, masked]);
}
class NativeWs {
  constructor(socket, head) {
    this.socket = socket;
    this.pending = [];
    this.waiters = [];
    this.buffer = Buffer.alloc(0);
    this.closed = false;
    socket.on("data", data => this.receive(data));
    socket.on("close", () => {
      this.closed = true;
      for (const waiter of this.waiters) {clearTimeout(waiter.timeout); waiter.reject(new Error("WS closed")); }
      this.waiters = [];
    });
    socket.on("error", () => { this.closed = true; });
    if (head?.length) this.receive(head);
  }
  receive(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const opcode = this.buffer[0] & 0x0f;
      const hasMask = (this.buffer[1] & 0x80) !== 0;
      let length = this.buffer[1] & 0x7f;
      let pos = 2;
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2); pos = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        const big = this.buffer.readBigUInt64BE(2);
        assert.ok(big < 1_000_000n);
        length = Number(big); pos = 10;
      }
      if (hasMask) pos += 4;
      if (this.buffer.length < pos + length) return;
      let payload = this.buffer.subarray(pos, pos + length);
      if (hasMask) {
        const key = this.buffer.subarray(pos - 4, pos);
        payload = Buffer.from(payload);
        for (let i = 0; i < length; i++) payload[i] ^= key[i % 4];
      }
      this.buffer = this.buffer.subarray(pos + length);
      if (opcode === 8) { this.closed = true; this.socket.destroy(); return; }
      if (opcode === 9) { this.socket.write(wsFrame({}, 10)); continue; }
      if (opcode !== 1) continue;
      let msg;
      try { msg = JSON.parse(payload.toString("utf8")); }
      catch { continue; }
      const idx = this.waiters.findIndex(w => w.predicate(msg));
      if (idx >= 0) {
        const [w] = this.waiters.splice(idx, 1);
        clearTimeout(w.timeout); w.resolve(msg);
      } else this.pending.push(msg);
    }
  }
  send(msg) { this.socket.write(wsFrame(msg)); }
  waitFor(predicate, timeoutMs = 8_000) {
    const found = this.pending.findIndex(predicate);
    if (found >= 0) return Promise.resolve(this.pending.splice(found, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timeout: undefined };
      waiter.timeout = setTimeout(() => {
        this.waiters = this.waiters.filter(w => w !== waiter);
        reject(new Error("Expected WebSocket frame missing"));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }
  close() { if (!this.closed) {this.socket.write(wsFrame({}, 8)); this.socket.end();} }
}
function connect(deviceId, forgedHeaders = false) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1", port,
      path: `/cloud/v1/ws/device/${deviceId}`,
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": randomBytes(16).toString("base64"),
        "X-Mote-Staging-Gate": gate,
        ...(forgedHeaders ? { "X-Mote-Cloud-Owner": B,
          "X-Mote-Cloud-Internal": "forged-by-desktop" } : {}),
      },
    });
    req.once("upgrade", (response, socket, head) => {
      if (response.statusCode !== 101) {socket.destroy();reject(new Error("Not upgraded"));return;}
      resolve(new NativeWs(socket, head));
    });
    req.once("response", res => {res.resume();reject(new Error(`WebSocket HTTP ${res.statusCode}`));});
    req.once("error", reject);
    req.end();
  });
}
async function call(path, { method = "GET", token, body, withGate = true } = {}) {
  const resp = await fetch(base + path, {
    method,
    headers: {
      ...(withGate ? { "X-Mote-Staging-Gate": gate } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await resp.text();
  return { status: resp.status, body: payload ? JSON.parse(payload) : null };
}
async function awaitServer() {
  for (let i = 0; i < 75; i++) {
    if (worker.exitCode !== null) throw new Error("Local workerd exited early");
    try {
      const response = await call("/cloud/v1/health");
      if (response.status === 200) return;
    } catch {/* starting */}
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error("Local workerd failed to become ready: " + workerOutput.slice(-2000));
}
async function main() {
  if (existsSync(devVars)) {
    throw new Error("Refusing to overwrite any existing .dev.vars");
  }
  writeFileSync(devVars, `MOTE_CLOUD_STAGING_GATE="${gate}"\nMOTE_CLOUD_INTERNAL_SECRET="${internal}"\n`,
    { flag: "wx", mode: 0o600 });
  createdVars = true;
  cli(["d1", "migrations", "apply", "CLOUD_DB", "--local", "--config", config, "--persist-to", state]);
  const fixture = join(state, "fixture.sql");
  writeFileSync(fixture, `
    INSERT INTO cloud_accounts (id, apple_subject, status, created_at_ms)
    VALUES ('${A}','local-a','active',${now}),('${B}','local-b','active',${now});
    INSERT INTO cloud_devices (id, owner_account_id, name, platform, credential_hash, status, created_at_ms, updated_at_ms)
    VALUES ('${DA}','${A}','A PC','windows','${hash(credentialA)}','active',${now},${now}),
           ('${DB}','${B}','B PC','macos','${hash(credentialB)}','active',${now},${now});
    INSERT INTO cloud_sessions (id, account_id, refresh_token_hash, access_token_hash, created_at_ms, expires_at_ms, access_expires_at_ms)
    VALUES ('${randomUUID()}','${A}','${hash("refresh-a")}', '${hash(tokenA)}',${now},${now+600000},${now+600000}),
           ('${randomUUID()}','${B}','${hash("refresh-b")}', '${hash(tokenB)}',${now},${now+600000},${now+600000});
  `, { mode: 0o600 });
  cli(["d1", "execute", "CLOUD_DB", "--local", "--config", config, "--persist-to", state, "--file", fixture]);
  worker = spawn(process.execPath, [wrangler, "dev", "--config", config, "--local",
    "--ip", "127.0.0.1", "--port", String(port), "--persist-to", state], {
    cwd: root, env, stdio: ["ignore","pipe","pipe"],
  });
  for (const stream of [worker.stdout, worker.stderr]) {
    stream.on("data", chunk => {workerOutput = (workerOutput + chunk.toString("utf8")).slice(-8000);});
  }
  await awaitServer();
  assert.equal((await call("/cloud/v1/health", { withGate:false })).status, 503);
  assert.equal((await call("/cloud/v1/health")).status, 200);
  const listA = await call("/cloud/v1/devices", { token: tokenA });
  const listB = await call("/cloud/v1/devices", { token: tokenB });
  assert.equal(listA.status, 200); assert.equal(listB.status, 200);
  assert.deepEqual(listA.body.devices.map(d => d.id), [DA]);
  assert.deepEqual(listB.body.devices.map(d => d.id), [DB]);
  const command = (token,deviceId) => call(`/cloud/v1/devices/${deviceId}/commands`, {
    method:"POST", token, body:{ action:"lock" },
  });
  assert.equal((await command(tokenA, DA)).status, 409, "Offline must not enqueue");
  assert.equal((await command(tokenB, DA)).status, 404, "Other tenant must be denied");
  const wrong = await connect(DA);
  wrong.send({type:"auth",version:1,device_id:DA,credential:credentialB,platform:"windows",actions:["lock"]});
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.ok(wrong.closed, "Incorrect device proof must disconnect");
  // Verify caller-controlled internal headers cannot redirect the tenant.
  const device = await connect(DA, true);
  try {
    device.send({type:"auth",version:1,device_id:DA,credential:credentialA,platform:"windows",actions:["lock"]});
    const auth = await device.waitFor(x => x.type === "auth_result");
    assert.equal(auth.status,"ok");
    device.send({type:"heartbeat",version:1,device_id:DA,sent_at:Date.now()});
    assert.equal((await device.waitFor(x=>x.type==="heartbeat_ack")).type,"heartbeat_ack");
    const pending = command(tokenA, DA);
    const frame = await device.waitFor(x=>x.type==="command",8_000);
    assert.equal(frame.action,"lock");assert.equal(frame.device_id,DA);
    assert.equal(frame.expires_at-frame.created_at,10_000);
    device.send({type:"command_result",version:1,command_id:frame.id,status:"completed",completed_at:Date.now()});
    const response = await pending;
    assert.equal(response.status,200);assert.equal(response.body.status,"completed");
    assert.equal((await command(tokenB, DA)).status,404);
    // Both tenants are simultaneously connected: B cannot receive A's
    // command and an independent B command cannot reach A's socket.
    const deviceB = await connect(DB);
    try {
      deviceB.send({type:"auth",version:1,device_id:DB,
        credential:credentialB,platform:"macos",actions:["lock"]});
      assert.equal((await deviceB.waitFor(x=>x.type==="auth_result")).status,"ok");
      const pendingB = command(tokenB, DB);
      const frameB = await deviceB.waitFor(x=>x.type==="command");
      assert.equal(frameB.device_id,DB);
      assert.equal(device.pending.filter(x=>x.type==="command").length,0);
      deviceB.send({type:"command_result",version:1,command_id:frameB.id,
        status:"completed",completed_at:Date.now()});
      assert.equal((await pendingB).status,200);
      assert.equal((await command(tokenA, DB)).status,404);
    } finally { deviceB.close(); }
  } finally {
    device.close();
  }
  await new Promise(resolve=>setTimeout(resolve,350));
  assert.equal((await command(tokenA,DA)).status,409,"Disconnected commands must not queue");
  console.log("CLOUD_WORKER_LOCAL_REALTIME_PASS: D1+DO+WebSocket auth/lock/owner/offline");
}
try {await main();}
catch(error){ console.error("CLOUD_WORKER_LOCAL_REALTIME_FAIL: "+String(error?.message??error));process.exitCode=1; }
finally{
  if(worker){worker.kill("SIGTERM");}
  if(createdVars){try{unlinkSync(devVars);}catch{}}
  rmSync(state,{recursive:true,force:true});
}

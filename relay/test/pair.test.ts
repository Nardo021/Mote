import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { ErrorCode } from "../src/utils/errors.js";
import {
  nextMessage,
  openSocket,
  openSocketListening,
  startTestServer,
  stopTestServer,
  TEST_DEVICE_ID,
  type TestServer,
} from "./helpers.js";

const PASSWORD = "correct-horse-admin";
const ORIGIN = "http://127.0.0.1:3000";
const PAIR_DEVICE_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_DEVICE_ID = "33333333-3333-4333-8333-333333333333";

function adminHeaders(cookie?: string) {
  return {
    origin: ORIGIN,
    "content-type": "application/json",
    ...(cookie ? { cookie } : {}),
  };
}

function sessionCookie(response: {
  headers: { [key: string]: unknown };
}): string {
  const raw = response.headers["set-cookie"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  assert.ok(value);
  const match = /mote_admin_session=([^;]+)/.exec(value);
  assert.ok(match?.[1]);
  return `mote_admin_session=${match[1]}`;
}

async function login(server: TestServer): Promise<string> {
  const response = await server.app.inject({
    method: "POST",
    url: "/admin/api/session",
    headers: adminHeaders(),
    payload: { username: "admin", password: PASSWORD },
  });
  assert.equal(response.statusCode, 200);
  return sessionCookie(response);
}

async function createPairRequest(
  server: TestServer,
  deviceId = PAIR_DEVICE_ID,
  name = "Leo’s MacBook",
) {
  return server.app.inject({
    method: "POST",
    url: "/v1/pair/requests",
    headers: { "content-type": "application/json" },
    payload: { device_id: deviceId, device_name: name },
  });
}

describe("device pairing", () => {
  let server: TestServer;
  let cookie: string;

  before(async () => {
    server = await startTestServer({
      pairTtlMs: 60_000,
      pairRateLimitMax: 5,
      pairRateLimitWindowMs: 60_000,
      pairIpRateLimitMax: 40,
      pairIpRateLimitWindowMs: 60_000,
    });
    server.ctx.admins.create("admin", PASSWORD);
    cookie = await login(server);
  });

  after(async () => {
    await stopTestServer(server);
  });

  it("creates a pending pair request and returns the secret once", async () => {
    const response = await createPairRequest(server);
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(typeof body.request_id, "string");
    assert.equal(typeof body.pair_secret, "string");
    assert.equal(typeof body.expires_at, "number");
    assert.ok(body.pair_secret.length > 16);
    assert.equal(body.pair_secret_hash, undefined);

    const listed = await server.app.inject({
      method: "GET",
      url: "/admin/api/pair-requests",
      headers: adminHeaders(cookie),
    });
    assert.equal(listed.statusCode, 200);
    const pending = listed.json().requests as Array<{
      id: string;
      device_id: string;
      device_name: string;
    }>;
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.id, body.request_id);
    assert.equal(pending[0]?.device_id, PAIR_DEVICE_ID);
    assert.equal(pending[0]?.device_name, "Leo’s MacBook");
    assert.equal(
      (pending[0] as { pair_secret?: string }).pair_secret,
      undefined,
    );
  });

  it("replaces a previous pending request for the same device", async () => {
    const first = await createPairRequest(server, OTHER_DEVICE_ID, "First");
    const second = await createPairRequest(server, OTHER_DEVICE_ID, "Second");
    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.notEqual(first.json().request_id, second.json().request_id);

    const listed = await server.app.inject({
      method: "GET",
      url: "/admin/api/pair-requests",
      headers: adminHeaders(cookie),
    });
    const forDevice = (
      listed.json().requests as Array<{
        device_id: string;
        device_name: string;
      }>
    ).filter((request) => request.device_id === OTHER_DEVICE_ID);
    assert.equal(forDevice.length, 1);
    assert.equal(forDevice[0]?.device_name, "Second");
  });

  it("rejects invalid device IDs and empty names", async () => {
    const badId = await server.app.inject({
      method: "POST",
      url: "/v1/pair/requests",
      headers: { "content-type": "application/json" },
      payload: { device_id: "not-a-uuid", device_name: "Mac" },
    });
    assert.equal(badId.statusCode, 400);
    assert.equal(badId.json().error.code, ErrorCode.INVALID_REQUEST);

    const emptyName = await server.app.inject({
      method: "POST",
      url: "/v1/pair/requests",
      headers: { "content-type": "application/json" },
      payload: { device_id: PAIR_DEVICE_ID, device_name: "   " },
    });
    assert.equal(emptyName.statusCode, 400);
  });

  it("rejects pairing a device that already exists", async () => {
    server.ctx.devices.createDevice("Existing", TEST_DEVICE_ID);
    const response = await createPairRequest(server, TEST_DEVICE_ID);
    assert.equal(response.statusCode, 409);
    assert.equal(response.json().error.code, ErrorCode.INVALID_REQUEST);
  });

  it("rate limits pair requests for one device", async () => {
    const limited = await startTestServer({
      pairTtlMs: 60_000,
      pairRateLimitMax: 2,
      pairRateLimitWindowMs: 60_000,
      pairIpRateLimitMax: 100,
      pairIpRateLimitWindowMs: 60_000,
    });
    try {
      const deviceId = "44444444-4444-4444-8444-444444444444";
      const first = await createPairRequest(limited, deviceId);
      const second = await createPairRequest(limited, deviceId);
      const third = await createPairRequest(limited, deviceId);
      assert.equal(first.statusCode, 200);
      assert.equal(second.statusCode, 200);
      assert.equal(third.statusCode, 429);
      assert.equal(third.json().error.code, ErrorCode.RATE_LIMITED);
    } finally {
      await stopTestServer(limited);
    }
  });

  it("requires an admin session to list or decide pair requests", async () => {
    const listed = await server.app.inject({
      method: "GET",
      url: "/admin/api/pair-requests",
    });
    assert.equal(listed.statusCode, 401);

    const approve = await server.app.inject({
      method: "POST",
      url: "/admin/api/pair-requests/missing/approve",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      payload: {},
    });
    assert.equal(approve.statusCode, 401);
  });

  it("approves a request, creates the device, and pushes the credential", async () => {
    const created = await createPairRequest(
      server,
      "55555555-5555-4555-8555-555555555555",
      "Office Mac",
    );
    assert.equal(created.statusCode, 200);
    const { request_id: requestId, pair_secret: pairSecret } =
      created.json() as {
        request_id: string;
        pair_secret: string;
      };

    const { socket, next } = await openSocketListening(
      `${server.baseUrl.replace("http", "ws")}/v1/ws/pair?request_id=${requestId}&pair_secret=${encodeURIComponent(pairSecret)}`,
    );
    const pending = await next();
    assert.equal(pending.type, "pair_pending");
    const approval = server.app.inject({
      method: "POST",
      url: `/admin/api/pair-requests/${requestId}/approve`,
      headers: adminHeaders(cookie),
      payload: { name: "Office MacBook" },
    });
    const message = await next();
    const approved = await approval;
    socket.close();

    assert.equal(approved.statusCode, 200);
    assert.equal(typeof approved.json().credential, "string");
    assert.equal(
      approved.json().device.id,
      "55555555-5555-4555-8555-555555555555",
    );
    assert.equal(approved.json().device.name, "Office MacBook");

    assert.equal(message.type, "pair_approved");
    assert.equal(message.device_id, "55555555-5555-4555-8555-555555555555");
    assert.equal(message.credential, approved.json().credential);
    assert.equal(message.name, "Office MacBook");

    const device = server.ctx.devices.getDevice(
      "55555555-5555-4555-8555-555555555555",
    );
    assert.ok(device);
    assert.equal(device.name, "Office MacBook");

    const listed = await server.app.inject({
      method: "GET",
      url: "/admin/api/pair-requests",
      headers: adminHeaders(cookie),
    });
    const stillPending = (listed.json().requests as Array<{ id: string }>).some(
      (request) => request.id === requestId,
    );
    assert.equal(stillPending, false);
  });

  it("does not deliver a credential over a socket with the wrong secret", async () => {
    const created = await createPairRequest(
      server,
      "66666666-6666-4666-8666-666666666666",
      "Wrong Secret",
    );
    const { request_id: requestId } = created.json() as { request_id: string };
    const socket = await openSocket(
      `${server.baseUrl.replace("http", "ws")}/v1/ws/pair?request_id=${requestId}&pair_secret=definitely-wrong`,
    );
    await assert.rejects(nextMessage(socket, 400), /closed/i);
  });

  it("rejects cancel with the wrong pair secret", async () => {
    const created = await createPairRequest(
      server,
      "77777777-7777-4777-8777-777777777777",
      "Cancel Me",
    );
    const { request_id: requestId } = created.json() as { request_id: string };
    const wrong = await server.app.inject({
      method: "POST",
      url: `/v1/pair/requests/${requestId}/cancel`,
      headers: { "content-type": "application/json" },
      payload: { pair_secret: "nope" },
    });
    assert.equal(wrong.statusCode, 401);
  });

  it("cancels a pending request with the pair secret", async () => {
    const created = await createPairRequest(
      server,
      "88888888-8888-4888-8888-888888888888",
      "Cancel OK",
    );
    const { request_id: requestId, pair_secret: pairSecret } =
      created.json() as {
        request_id: string;
        pair_secret: string;
      };
    const cancelled = await server.app.inject({
      method: "POST",
      url: `/v1/pair/requests/${requestId}/cancel`,
      headers: { "content-type": "application/json" },
      payload: { pair_secret: pairSecret },
    });
    assert.equal(cancelled.statusCode, 200);

    const listed = await server.app.inject({
      method: "GET",
      url: "/admin/api/pair-requests",
      headers: adminHeaders(cookie),
    });
    const stillPending = (listed.json().requests as Array<{ id: string }>).some(
      (request) => request.id === requestId,
    );
    assert.equal(stillPending, false);
  });

  it("rejects a request and notifies the waiting socket", async () => {
    const created = await createPairRequest(
      server,
      "99999999-9999-4999-8999-999999999999",
      "Reject Me",
    );
    const { request_id: requestId, pair_secret: pairSecret } =
      created.json() as {
        request_id: string;
        pair_secret: string;
      };
    const { socket, next } = await openSocketListening(
      `${server.baseUrl.replace("http", "ws")}/v1/ws/pair?request_id=${requestId}&pair_secret=${encodeURIComponent(pairSecret)}`,
    );
    assert.equal((await next()).type, "pair_pending");
    const rejection = server.app.inject({
      method: "POST",
      url: `/admin/api/pair-requests/${requestId}/reject`,
      headers: adminHeaders(cookie),
      payload: {},
    });
    const message = await next();
    const rejected = await rejection;
    socket.close();
    assert.equal(rejected.statusCode, 200);
    assert.equal(message.type, "pair_rejected");
  });

  it("does not approve an expired request", async () => {
    const shortLived = await startTestServer({
      pairTtlMs: 1,
      pairRateLimitMax: 10,
      pairRateLimitWindowMs: 60_000,
      pairIpRateLimitMax: 40,
      pairIpRateLimitWindowMs: 60_000,
    });
    shortLived.ctx.admins.create("admin", PASSWORD);
    const adminCookie = await login(shortLived);
    try {
      const created = await createPairRequest(
        shortLived,
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      );
      assert.equal(created.statusCode, 200);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const approved = await shortLived.app.inject({
        method: "POST",
        url: `/admin/api/pair-requests/${created.json().request_id}/approve`,
        headers: adminHeaders(adminCookie),
        payload: {},
      });
      assert.equal(approved.statusCode, 404);
    } finally {
      await stopTestServer(shortLived);
    }
  });

  it("serves a public shortcut setup page without tokens or online status", async () => {
    const known = await server.app.inject({
      method: "GET",
      url: `/s/${PAIR_DEVICE_ID}`,
    });
    assert.equal(known.statusCode, 200);
    assert.match(known.headers["content-type"] ?? "", /text\/html/);
    assert.match(known.body, new RegExp(PAIR_DEVICE_ID));
    assert.match(known.body, /\/v1\/devices\/.*\/commands/);
    assert.equal(known.body.includes("Bearer"), false);
    assert.equal(/online/i.test(known.body), false);
    assert.equal(known.body.includes("send_command"), false);

    const unknown = await server.app.inject({
      method: "GET",
      url: "/s/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    assert.equal(unknown.statusCode, 200);
    assert.match(unknown.body, /bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/);
    assert.equal(unknown.body.includes("Bearer"), false);
  });

  it("adds an iCloud shortcut link when configured", async () => {
    const withIcloud = await startTestServer({
      shortcutIcloudUrl: "https://www.icloud.com/shortcuts/example",
    });
    try {
      const page = await withIcloud.app.inject({
        method: "GET",
        url: `/s/${PAIR_DEVICE_ID}`,
      });
      assert.equal(page.statusCode, 200);
      assert.match(page.body, /icloud.com\/shortcuts\/example/);
      assert.equal(page.body.includes("Bearer"), false);
    } finally {
      await stopTestServer(withIcloud);
    }
  });
});

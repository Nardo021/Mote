import {
  isCommandEventStatus,
  type ActivityQuery,
} from "../activity/activityTypes.js";
import type { AppContext } from "../appContext.js";
import {
  authenticateShortcutToken,
  maybeTouchTokenLastUsed,
} from "../auth/shortcutAuth.js";
import { isCommandSource } from "../commands/commandTypes.js";
import {
  ADMIN_SESSION_COOKIE,
  PROTOCOL_VERSION,
} from "../config/constants.js";
import { allowedDashboardOrigins } from "../admin/guards.js";
import { presentAdminDevice } from "../admin/presenters.js";
import { relayOperationalStatus } from "../admin/routes.js";
import { parseOptionalName } from "../pairing/pairRoutes.js";
import { renderShortcutSetupPage } from "../pairing/shortcutSetupPage.js";
import type { DeviceStatus } from "../devices/deviceTypes.js";
import { AppError, ErrorCode, invalidRequest, rateLimited, toErrorEnvelope } from "../utils/errors.js";
import { nowMs } from "../utils/time.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
  "X-Frame-Options": "DENY",
};

type JsonResult = {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
};

export async function handleWorkerRequest(
  request: Request,
  ctx: AppContext,
): Promise<Response> {
  const url = new URL(request.url);
  try {
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ status: 200, body: { status: "ok" } });
    }
    if (request.method === "GET" && url.pathname === "/ready") {
      return json(ready(ctx));
    }
    const deviceStatus = matchPath(url.pathname, "/v1/devices/:deviceId/status");
    if (request.method === "GET" && deviceStatus) {
      authenticateShortcutToken(request.headers.get("authorization") ?? undefined, ctx.tokenRepository);
      const device = ctx.devices.requireDevice(deviceStatus.deviceId ?? "");
      const status: DeviceStatus = {
        device_id: device.id,
        name: device.name,
        online: ctx.connections.isOnline(device.id),
        last_seen_at: device.lastSeenAt,
      };
      return json({ status: 200, body: status });
    }
    const deviceCommand = matchPath(url.pathname, "/v1/devices/:deviceId/commands");
    if (request.method === "POST" && deviceCommand) {
      const body = await readJson(request, ctx.config.maxBodyBytes);
      const client = authenticateShortcutToken(
        request.headers.get("authorization") ?? undefined,
        ctx.tokenRepository,
      );
      if (!ctx.rateLimiter.consume(client.tokenId)) {
        throw rateLimited();
      }
      maybeTouchTokenLastUsed({ id: client.tokenId }, ctx.tokenRepository, ctx.config);
      const result = await ctx.commands.submit(deviceCommand.deviceId ?? "", body, "shortcut");
      return json({ status: result.httpStatus, body: result.payload });
    }
    if (request.method === "POST" && url.pathname === "/v1/pair/requests") {
      const body = objectBody(await readJson(request, ctx.config.maxBodyBytes));
      const deviceId = requiredString(body, "device_id");
      const created = ctx.pairing.createRequest(
        deviceId,
        requiredString(body, "device_name"),
        clientIp(request),
      );
      return json({
        status: 200,
        body: {
          request_id: created.id,
          pair_secret: created.pairSecret,
          expires_at: created.expiresAt,
        },
      });
    }
    const cancelPair = matchPath(url.pathname, "/v1/pair/requests/:id/cancel");
    if (request.method === "POST" && cancelPair) {
      const body = objectBody(await readJson(request, ctx.config.maxBodyBytes));
      ctx.pairing.cancel(cancelPair.id ?? "", requiredString(body, "pair_secret"));
      return json({ status: 200, body: { ok: true } });
    }
    const shortcutPage = matchPath(url.pathname, "/s/:deviceId");
    if (request.method === "GET" && shortcutPage) {
      return html(
        renderShortcutSetupPage(
          ctx.config.publicUrl,
          shortcutPage.deviceId ?? "",
          ctx.config.shortcutIcloudUrl,
        ),
        "no-store",
      );
    }
    if (url.pathname.startsWith("/admin/api/") || url.pathname === "/admin/api") {
      return handleAdmin(request, url, ctx);
    }
    return json({
      status: 404,
      body: toErrorEnvelope(new AppError(ErrorCode.INVALID_REQUEST, "Not found.", 404)),
    });
  } catch (error) {
    return json(errorResult(error));
  }
}

async function handleAdmin(request: Request, url: URL, ctx: AppContext): Promise<Response> {
  assertAdminMutation(request, ctx);
  const path = url.pathname.slice("/admin/api".length) || "/";
  const noStore = { "Cache-Control": "no-store" };
  if (request.method === "GET" && path === "/session") {
    const configured = ctx.admins.hasAny();
    try {
      const session = requireAdmin(request, ctx);
      return json({
        status: 200,
        headers: noStore,
        body: {
          authenticated: true,
          configured,
          user: { id: session.adminId, username: session.username },
        },
      });
    } catch (error) {
      if (error instanceof AppError && (error.statusCode === 401 || error.statusCode === 403)) {
        return json({ status: 200, headers: noStore, body: { authenticated: false, configured } });
      }
      throw error;
    }
  }
  if (request.method === "POST" && path === "/session") {
    const source = clientIp(request);
    if (!ctx.adminLoginRateLimiter.consume(`admin-login:${source}`)) {
      throw new AppError(ErrorCode.RATE_LIMITED, "Too many sign-in attempts.", 429);
    }
    const body = objectBody(await readJson(request, ctx.config.maxBodyBytes));
    const username = requiredString(body, "username");
    const password = requiredString(body, "password");
    if (!ctx.admins.hasAny()) {
      throw new AppError(ErrorCode.UNAUTHORIZED, "Invalid username or password.", 401);
    }
    const adminUser = ctx.admins.authenticate(username, password);
    const session = ctx.sessions.create(adminUser.id);
    ctx.admins.recordLogin(adminUser.id);
    return json({
      status: 200,
      headers: {
        ...noStore,
        "Set-Cookie": sessionCookie(session.token, ctx, session.expiresAt),
      },
      body: {
        authenticated: true,
        user: { id: adminUser.id, username: adminUser.username },
      },
    });
  }
  if (request.method === "DELETE" && path === "/session") {
    try {
      const session = requireAdmin(request, ctx);
      ctx.sessions.revoke(session.sessionId);
    } catch {
      // Clearing an already-invalid cookie is still a successful logout.
    }
    return json({
      status: 200,
      headers: { ...noStore, "Set-Cookie": clearSessionCookie(ctx) },
      body: { authenticated: false },
    });
  }
  if (request.method === "POST" && path === "/account/password") {
    const session = requireAdmin(request, ctx);
    const body = objectBody(await readJson(request, ctx.config.maxBodyBytes));
    const adminUser = ctx.admins.requireById(session.adminId);
    ctx.admins.verifyCurrentPassword(adminUser, requiredString(body, "current_password"));
    ctx.admins.setPassword(adminUser.id, requiredString(body, "new_password"));
    ctx.sessions.revokeAllForAdmin(adminUser.id, session.sessionId);
    return json({ status: 200, headers: noStore, body: { ok: true } });
  }
  if (request.method === "GET" && path === "/events") {
    requireAdmin(request, ctx);
    return eventStream(ctx);
  }
  if (request.method === "GET" && path === "/overview") {
    requireAdmin(request, ctx);
    return json({ status: 200, headers: noStore, body: overview(ctx) });
  }
  if (request.method === "GET" && path === "/pair-requests") {
    requireAdmin(request, ctx);
    return json({ status: 200, headers: noStore, body: { requests: ctx.pairing.listPending() } });
  }
  const approve = matchPath(path, "/pair-requests/:id/approve");
  if (request.method === "POST" && approve) {
    requireAdmin(request, ctx);
    const result = ctx.pairing.approve(approve.id ?? "", parseOptionalName(await readJson(request, ctx.config.maxBodyBytes)));
    return json({
      status: 200,
      headers: noStore,
      body: {
        credential: result.credential,
        device: { id: result.device.id, name: result.device.name, created_at: result.device.createdAt },
      },
    });
  }
  const reject = matchPath(path, "/pair-requests/:id/reject");
  if (request.method === "POST" && reject) {
    requireAdmin(request, ctx);
    ctx.pairing.reject(reject.id ?? "");
    return json({ status: 200, headers: noStore, body: { ok: true } });
  }
  if (request.method === "GET" && path === "/devices") {
    requireAdmin(request, ctx);
    return json({
      status: 200,
      headers: noStore,
      body: {
        devices: ctx.devices.listDevices().map((device) =>
          presentAdminDevice(device, ctx.connections.get(device.id), ctx.activity.latestForDevice(device.id)),
        ),
      },
    });
  }
  const device = matchPath(path, "/devices/:id");
  if (request.method === "GET" && device) {
    requireAdmin(request, ctx);
    const record = ctx.devices.requireDevice(device.id ?? "");
    return json({
      status: 200,
      headers: noStore,
      body: presentAdminDevice(record, ctx.connections.get(record.id), ctx.activity.latestForDevice(record.id)),
    });
  }
  const rename = matchPath(path, "/devices/:id/rename");
  if (request.method === "POST" && rename) {
    requireAdmin(request, ctx);
    const body = objectBody(await readJson(request, ctx.config.maxBodyBytes));
    const record = ctx.devices.renameDevice(rename.id ?? "", requiredString(body, "name"));
    ctx.adminEvents.publish("devices");
    return json({
      status: 200,
      headers: noStore,
      body: presentAdminDevice(record, ctx.connections.get(record.id), ctx.activity.latestForDevice(record.id)),
    });
  }
  const command = matchPath(path, "/devices/:id/commands");
  if (request.method === "POST" && command) {
    requireAdmin(request, ctx);
    const result = await ctx.commands.submit(command.id ?? "", await readJson(request, ctx.config.maxBodyBytes), "dashboard");
    return json({
      status: result.httpStatus,
      headers: noStore,
      body: {
        status: result.payload.status,
        device_id: result.payload.device_id,
        command_id: result.payload.command_id,
        duration_ms: result.durationMs ?? null,
      },
    });
  }
  const rotateDevice = matchPath(path, "/devices/:id/credential/rotate");
  if (request.method === "POST" && rotateDevice) {
    requireAdmin(request, ctx);
    const rotated = ctx.devices.rotateDeviceCredential(rotateDevice.id ?? "");
    ctx.connections.closeDevice(rotateDevice.id ?? "", 1000, "credential_rotated");
    ctx.adminEvents.publish("devices");
    return json({ status: 200, headers: noStore, body: { credential: rotated.credential } });
  }
  const disableDevice = matchPath(path, "/devices/:id/disable");
  if (request.method === "POST" && disableDevice) {
    requireAdmin(request, ctx);
    const record = ctx.devices.disableDevice(disableDevice.id ?? "");
    ctx.connections.closeDevice(disableDevice.id ?? "", 1000, "device_disabled");
    ctx.adminEvents.publish("devices");
    return json({
      status: 200,
      headers: noStore,
      body: presentAdminDevice(record, undefined, ctx.activity.latestForDevice(record.id)),
    });
  }
  const enableDevice = matchPath(path, "/devices/:id/enable");
  if (request.method === "POST" && enableDevice) {
    requireAdmin(request, ctx);
    const record = ctx.devices.enableDevice(enableDevice.id ?? "");
    ctx.adminEvents.publish("devices");
    return json({
      status: 200,
      headers: noStore,
      body: presentAdminDevice(record, ctx.connections.get(record.id), ctx.activity.latestForDevice(record.id)),
    });
  }
  if (request.method === "GET" && path === "/tokens") {
    requireAdmin(request, ctx);
    return json({
      status: 200,
      headers: noStore,
      body: {
        tokens: ctx.devices.listTokens().map((token) => ({
          id: token.id,
          name: token.name,
          permission: token.permission,
          enabled: token.enabled,
          created_at: token.createdAt,
          last_used_at: token.lastUsedAt,
        })),
      },
    });
  }
  if (request.method === "POST" && path === "/tokens") {
    requireAdmin(request, ctx);
    const body = objectBody(await readJson(request, ctx.config.maxBodyBytes));
    const created = ctx.devices.createShortcutToken(requiredString(body, "name"));
    ctx.adminEvents.publish("tokens");
    return json({
      status: 200,
      headers: noStore,
      body: {
        id: created.id,
        name: created.name,
        permission: created.permission,
        token: created.token,
        created_at: created.createdAt,
      },
    });
  }
  const rotateToken = matchPath(path, "/tokens/:id/rotate");
  if (request.method === "POST" && rotateToken) {
    requireAdmin(request, ctx);
    const rotated = ctx.devices.rotateShortcutToken(rotateToken.id ?? "");
    ctx.adminEvents.publish("tokens");
    return json({
      status: 200,
      headers: noStore,
      body: {
        id: rotated.id,
        name: rotated.name,
        permission: rotated.permission,
        token: rotated.token,
        created_at: rotated.createdAt,
      },
    });
  }
  const disableToken = matchPath(path, "/tokens/:id/disable");
  if (request.method === "POST" && disableToken) {
    requireAdmin(request, ctx);
    const token = ctx.devices.disableToken(disableToken.id ?? "");
    ctx.adminEvents.publish("tokens");
    return json({
      status: 200,
      headers: noStore,
      body: {
        id: token.id,
        name: token.name,
        permission: token.permission,
        enabled: token.enabled,
        created_at: token.createdAt,
        last_used_at: token.lastUsedAt,
      },
    });
  }
  const enableToken = matchPath(path, "/tokens/:id/enable");
  if (request.method === "POST" && enableToken) {
    requireAdmin(request, ctx);
    const token = ctx.devices.enableToken(enableToken.id ?? "");
    ctx.adminEvents.publish("tokens");
    return json({
      status: 200,
      headers: noStore,
      body: {
        id: token.id,
        name: token.name,
        permission: token.permission,
        enabled: token.enabled,
        created_at: token.createdAt,
        last_used_at: token.lastUsedAt,
      },
    });
  }
  if (request.method === "GET" && path === "/activity") {
    requireAdmin(request, ctx);
    return json({ status: 200, headers: noStore, body: activityList(url, ctx) });
  }
  if (request.method === "GET" && path === "/system") {
    requireAdmin(request, ctx);
    return json({
      status: 200,
      headers: noStore,
      body: {
        environment: ctx.config.env,
        public_url: ctx.config.publicUrl,
        protocol_version: PROTOCOL_VERSION,
        database: "sqlite",
        uptime_ms: nowMs() - ctx.startedAt,
        command_ttl_ms: ctx.config.commandTtlMs,
        heartbeat_stale_ms: ctx.config.heartbeatStaleMs,
      },
    });
  }
  throw new AppError(ErrorCode.INVALID_REQUEST, "Not found.", 404);
}

function overview(ctx: AppContext) {
  const now = nowMs();
  const devices = ctx.devices.listDevices();
  let online = 0;
  for (const device of devices) {
    if (ctx.connections.isOnline(device.id)) {
      online += 1;
    }
  }
  const counts = ctx.activity.countsSince(now - DAY_MS);
  const recent = ctx.activity.recent().map((event) => {
    const device = ctx.devices.getDevice(event.deviceId);
    return {
      id: event.id,
      command_id: event.commandId,
      device_id: event.deviceId,
      device_name: device?.name ?? event.deviceId,
      action: event.action,
      source: event.source,
      status: event.status,
      created_at: event.createdAt,
      duration_ms: event.durationMs,
      error_code: event.errorCode,
    };
  });
  return {
    relay: {
      status: relayOperationalStatus(ctx),
      started_at: ctx.startedAt,
      uptime_ms: now - ctx.startedAt,
      protocol_version: PROTOCOL_VERSION,
    },
    devices: { total: devices.length, online, offline: devices.length - online },
    commands: { completed_24h: counts.completed, failed_24h: counts.failed },
    recent_activity: recent,
  };
}

function activityList(url: URL, ctx: AppContext) {
  const status = url.searchParams.get("status") ?? undefined;
  const source = url.searchParams.get("source") ?? undefined;
  if (status !== undefined && !isCommandEventStatus(status)) {
    throw invalidRequest("Invalid status filter.");
  }
  if (source !== undefined && !isCommandSource(source)) {
    throw invalidRequest("Invalid source filter.");
  }
  const filter: Partial<ActivityQuery> = {};
  const limit = optionalPositiveInt(url.searchParams.get("limit"));
  const offset = optionalPositiveInt(url.searchParams.get("offset"));
  if (limit !== undefined) {
    filter.limit = limit;
  }
  if (offset !== undefined) {
    filter.offset = offset;
  }
  const deviceId = url.searchParams.get("device_id");
  if (deviceId !== null) {
    filter.deviceId = deviceId;
  }
  if (status !== undefined && isCommandEventStatus(status)) {
    filter.status = status;
  }
  if (source !== undefined && isCommandSource(source)) {
    filter.source = source;
  }
  const action = url.searchParams.get("action");
  if (action !== null) {
    filter.action = action;
  }
  return {
    events: ctx.activity.list(filter).map((event) => {
      const device = ctx.devices.getDevice(event.deviceId);
      return {
        id: event.id,
        command_id: event.commandId,
        device_id: event.deviceId,
        device_name: device?.name ?? event.deviceId,
        action: event.action,
        source: event.source,
        status: event.status,
        created_at: event.createdAt,
        sent_at: event.sentAt,
        completed_at: event.completedAt,
        duration_ms: event.durationMs,
        error_code: event.errorCode,
      };
    }),
  };
}

function eventStream(ctx: AppContext): Response {
  const encoder = new TextEncoder();
  let unsubscribe = (): void => undefined;
  let ping: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          unsubscribe();
          if (ping !== undefined) {
            clearInterval(ping);
          }
        }
      };
      unsubscribe = ctx.adminEvents.subscribe((event) => {
        send(`data: ${JSON.stringify(event)}\n\n`);
      });
      ping = setInterval(() => {
        send(": ping\n\n");
      }, 15_000);
      send(`data: ${JSON.stringify({ topics: ["devices", "pairing", "activity", "tokens"] })}\n\n`);
    },
    cancel() {
      unsubscribe();
      if (ping !== undefined) {
        clearInterval(ping);
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}

function ready(ctx: AppContext): JsonResult {
  if (!ctx.ready) {
    return { status: 503, body: { status: "not_ready" } };
  }
  try {
    ctx.db.prepare("SELECT 1").get();
  } catch {
    return { status: 503, body: { status: "not_ready" } };
  }
  return { status: 200, body: { status: "ok" } };
}

function requireAdmin(request: Request, ctx: AppContext) {
  return ctx.sessions.authenticate(readSessionCookie(request));
}

function readSessionCookie(request: Request): string | undefined {
  const header = request.headers.get("cookie");
  if (header === null) {
    return undefined;
  }
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    if (name !== ADMIN_SESSION_COOKIE) {
      continue;
    }
    const value = decodeURIComponent(part.slice(separator + 1).trim());
    return value === "" ? undefined : value;
  }
  return undefined;
}

function sessionCookie(token: string, ctx: AppContext, expiresAt: number): string {
  const secure = ctx.config.env === "production" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secure}; Expires=${new Date(expiresAt).toUTCString()}`;
}

function clearSessionCookie(ctx: AppContext): string {
  const secure = ctx.config.env === "production" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax${secure}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

function assertAdminMutation(request: Request, ctx: AppContext): void {
  const method = request.method.toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return;
  }
  const origin = requestOrigin(request);
  const host = request.headers.get("host") ?? undefined;
  const allowed = allowedDashboardOrigins(ctx.config);
  const sameOrigin = host !== undefined && origin === `${protocolOf(request)}://${host}`;
  if (origin === undefined || (!allowed.has(origin) && !sameOrigin)) {
    throw new AppError(ErrorCode.CSRF_FORBIDDEN, "Request origin is not allowed.", 403);
  }
  if (method === "DELETE") {
    return;
  }
  const contentType = request.headers.get("content-type");
  if (contentType === null || !contentType.toLowerCase().startsWith("application/json")) {
    throw new AppError(ErrorCode.INVALID_REQUEST, "JSON content type is required.", 400);
  }
}

function requestOrigin(request: Request): string | undefined {
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== "") {
    return origin;
  }
  const referer = request.headers.get("referer");
  if (referer !== null) {
    try {
      return new URL(referer).origin;
    } catch {
      return undefined;
    }
  }
  const host = request.headers.get("host");
  if (host === null) {
    return undefined;
  }
  return `${protocolOf(request)}://${host}`;
}

function protocolOf(request: Request): string {
  return new URL(request.url).protocol.replace(":", "");
}

function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}

async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) {
    throw new AppError(ErrorCode.INVALID_REQUEST, "Request body is too large.", 413);
  }
  if (text.trim() === "") {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw invalidRequest("Invalid request.");
  }
}

function objectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw invalidRequest("JSON object body is required.");
  }
  return body as Record<string, unknown>;
}

function requiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string") {
    throw invalidRequest(`${key} is required.`);
  }
  return value;
}

function optionalPositiveInt(value: string | null): number | undefined {
  if (value === null || value === "") {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw invalidRequest("Invalid numeric query parameter.");
  }
  return parsed;
}

function matchPath(pathname: string, pattern: string): Record<string, string> | undefined {
  const pathParts = pathname.split("/").filter((part) => part !== "");
  const patternParts = pattern.split("/").filter((part) => part !== "");
  if (pathParts.length !== patternParts.length) {
    return undefined;
  }
  const params: Record<string, string> = {};
  for (let index = 0; index < patternParts.length; index += 1) {
    const expected = patternParts[index] ?? "";
    const actual = pathParts[index] ?? "";
    if (expected.startsWith(":")) {
      params[expected.slice(1)] = decodeURIComponent(actual);
      continue;
    }
    if (expected !== actual) {
      return undefined;
    }
  }
  return params;
}

function errorResult(error: unknown): JsonResult {
  if (error instanceof AppError) {
    return { status: error.statusCode, body: toErrorEnvelope(error) };
  }
  return {
    status: 500,
    body: toErrorEnvelope(new AppError(ErrorCode.INTERNAL_ERROR, "Unexpected server failure.", 500)),
  };
}

function json(result: JsonResult): Response {
  const headers = new Headers({
    ...SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
  });
  if (result.headers) {
    for (const [key, value] of Object.entries(result.headers)) {
      headers.set(key, value);
    }
  }
  return new Response(JSON.stringify(result.body), { status: result.status, headers });
}

function html(body: string, cacheControl: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": cacheControl,
    },
  });
}

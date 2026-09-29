import {
  isCommandEventStatus,
  type ActivityQuery,
} from "../activity/activityTypes.js";
import type { AppContext } from "../appContext.js";
import { presentAdminDevice, presentAdminToken } from "../admin/presenters.js";
import {
  assertMutationAllowed,
  type HeaderLookup,
} from "../admin/guards.js";
import { relayOperationalStatus } from "../admin/status.js";
import {
  assertTokenDeviceScope,
  authenticateShortcutToken,
  commandSourceForToken,
  maybeTouchTokenLastUsed,
} from "../auth/shortcutAuth.js";
import { isCommandSource } from "../commands/commandTypes.js";
import { ADMIN_SESSION_COOKIE, PROTOCOL_VERSION } from "../config/constants.js";
import type { DeviceStatus } from "../devices/deviceTypes.js";
import { isCommandClientKind, type CommandClientKind } from "../devices/tokenTypes.js";
import { renderShortcutSetupPage } from "../pairing/shortcutSetupPage.js";
import { SocketClose } from "../protocol/closeReasons.js";
import { AppError, ErrorCode, invalidRequest, rateLimited } from "../utils/errors.js";
import { nowMs } from "../utils/time.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const NO_STORE = { "Cache-Control": "no-store" };

export type RelayHttpLog = {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
};

export type RelayHttpRequest = {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: HeaderLookup;
  ip: string;
  protocol: string;
  hasParsedBody: boolean;
  parsedBody?: unknown;
  rawBody?: string;
  log?: RelayHttpLog;
};

export type SessionDirective =
  | { action: "set"; token: string; expiresAt: number }
  | { action: "clear" };

export type RelayHttpResult =
  | {
      kind: "json";
      status: number;
      body: unknown;
      headers?: Record<string, string>;
      session?: SessionDirective;
    }
  | { kind: "html"; status: number; body: string; headers?: Record<string, string> }
  | { kind: "sse" }
  | { kind: "unhandled" };

export async function handleRelayHttp(
  request: RelayHttpRequest,
  ctx: AppContext,
): Promise<RelayHttpResult> {
  const method = request.method.toUpperCase();
  const path = request.path;
  if (method === "GET" && path === "/health") {
    return json(200, { status: "ok" });
  }
  if (method === "GET" && path === "/ready") {
    return ready(ctx);
  }
  const deviceStatus = matchPath(path, "/v1/devices/:deviceId/status");
  if (method === "GET" && deviceStatus) {
    const client = authenticateShortcutToken(authorization(request), ctx.tokenRepository);
    const deviceId = deviceStatus.deviceId ?? "";
    assertTokenDeviceScope(client, deviceId);
    const device = ctx.devices.requireDevice(deviceId);
    return json(200, publicDeviceStatus(ctx, device.id));
  }
  const deviceCommand = matchPath(path, "/v1/devices/:deviceId/commands");
  if (method === "POST" && deviceCommand) {
    const client = authenticateShortcutToken(authorization(request), ctx.tokenRepository);
    const deviceId = deviceCommand.deviceId ?? "";
    assertTokenDeviceScope(client, deviceId);
    if (!ctx.rateLimiter.consume(client.tokenId)) {
      request.log?.warn({ token_id: client.tokenId }, "rate limit triggered");
      throw rateLimited();
    }
    maybeTouchTokenLastUsed({ id: client.tokenId }, ctx.tokenRepository, ctx.config);
    const result = await ctx.commands.submit(
      deviceId,
      jsonBody(request, ctx.config.maxBodyBytes),
      commandSourceForToken(client),
    );
    return json(result.httpStatus, result.payload);
  }
  if (method === "POST" && path === "/v1/pair/requests") {
    const body = objectBody(jsonBody(request, ctx.config.maxBodyBytes));
    const deviceId = requiredString(body, "device_id");
    const created = ctx.pairing.createRequest(
      deviceId,
      requiredString(body, "device_name"),
      request.ip,
    );
    request.log?.info(
      { pair_request_id: created.id, device_id: deviceId },
      "pair request created",
    );
    return json(200, {
      request_id: created.id,
      pair_secret: created.pairSecret,
      expires_at: created.expiresAt,
    });
  }
  const cancelPair = matchPath(path, "/v1/pair/requests/:id/cancel");
  if (method === "POST" && cancelPair) {
    const body = objectBody(jsonBody(request, ctx.config.maxBodyBytes));
    const requestId = cancelPair.id ?? "";
    ctx.pairing.cancel(requestId, requiredString(body, "pair_secret"));
    request.log?.info({ pair_request_id: requestId }, "pair request cancelled");
    return json(200, { ok: true });
  }
  const shortcutPage = matchPath(path, "/s/:deviceId");
  if (method === "GET" && shortcutPage) {
    return {
      kind: "html",
      status: 200,
      body: renderShortcutSetupPage(
        ctx.config.publicUrl,
        shortcutPage.deviceId ?? "",
        ctx.config.shortcutIcloudUrl,
      ),
      headers: { "Cache-Control": "no-store" },
    };
  }
  if (path === "/admin/api" || path.startsWith("/admin/api/")) {
    assertMutationAllowed(method, request.headers, request.protocol, ctx.config);
    return handleAdmin(request, ctx, method, path);
  }
  return { kind: "unhandled" };
}

async function handleAdmin(
  request: RelayHttpRequest,
  ctx: AppContext,
  method: string,
  path: string,
): Promise<RelayHttpResult> {
  if (method === "GET" && path === "/admin/api/session") {
    const configured = ctx.admins.hasAny();
    try {
      const session = requireAdmin(request, ctx);
      return json(
        200,
        {
          authenticated: true,
          configured,
          user: { id: session.adminId, username: session.username },
        },
        NO_STORE,
      );
    } catch (error) {
      if (error instanceof AppError && (error.statusCode === 401 || error.statusCode === 403)) {
        return json(200, { authenticated: false, configured }, NO_STORE);
      }
      throw error;
    }
  }
  if (method === "POST" && path === "/admin/api/session") {
    if (!ctx.adminLoginRateLimiter.consume(`admin-login:${request.ip}`)) {
      request.log?.warn({ source: request.ip }, "admin login rate limited");
      throw new AppError(ErrorCode.RATE_LIMITED, "Too many sign-in attempts.", 429);
    }
    const body = objectBody(jsonBody(request, ctx.config.maxBodyBytes));
    const username = requiredString(body, "username");
    const password = requiredString(body, "password");
    if (!ctx.admins.hasAny()) {
      request.log?.warn({ username }, "admin login failure");
      throw new AppError(ErrorCode.UNAUTHORIZED, "Invalid username or password.", 401);
    }
    try {
      const adminUser = ctx.admins.authenticate(username, password);
      const session = ctx.sessions.create(adminUser.id);
      ctx.admins.recordLogin(adminUser.id);
      request.log?.info(
        { admin_id: adminUser.id, username: adminUser.username },
        "admin login success",
      );
      return json(
        200,
        {
          authenticated: true,
          user: { id: adminUser.id, username: adminUser.username },
        },
        NO_STORE,
        { action: "set", token: session.token, expiresAt: session.expiresAt },
      );
    } catch (error) {
      if (error instanceof AppError && error.code === ErrorCode.ADMIN_DISABLED) {
        request.log?.warn({ username }, "admin disabled");
      } else {
        request.log?.warn({ username }, "admin login failure");
      }
      throw error;
    }
  }
  if (method === "DELETE" && path === "/admin/api/session") {
    try {
      const session = requireAdmin(request, ctx);
      ctx.sessions.revoke(session.sessionId);
      request.log?.info(
        { admin_id: session.adminId, username: session.username },
        "admin logout",
      );
    } catch {
      // Clearing an already-invalid cookie is still a successful logout.
    }
    return json(200, { authenticated: false }, NO_STORE, { action: "clear" });
  }
  if (method === "POST" && path === "/admin/api/account/password") {
    const session = requireAdmin(request, ctx);
    const body = objectBody(jsonBody(request, ctx.config.maxBodyBytes));
    const adminUser = ctx.admins.requireById(session.adminId);
    ctx.admins.verifyCurrentPassword(adminUser, requiredString(body, "current_password"));
    ctx.admins.setPassword(adminUser.id, requiredString(body, "new_password"));
    ctx.sessions.revokeAllForAdmin(adminUser.id, session.sessionId);
    request.log?.info(
      { admin_id: adminUser.id, username: adminUser.username },
      "admin password changed",
    );
    return json(200, { ok: true }, NO_STORE);
  }
  if (method === "GET" && path === "/admin/api/events") {
    requireAdmin(request, ctx);
    return { kind: "sse" };
  }
  if (method === "GET" && path === "/admin/api/overview") {
    requireAdmin(request, ctx);
    return json(200, overview(ctx), NO_STORE);
  }
  if (method === "GET" && path === "/admin/api/pair-requests") {
    requireAdmin(request, ctx);
    return json(200, { requests: ctx.pairing.listPending() }, NO_STORE);
  }
  const approve = matchPath(path, "/admin/api/pair-requests/:id/approve");
  if (method === "POST" && approve) {
    const session = requireAdmin(request, ctx);
    const requestId = approve.id ?? "";
    const result = ctx.pairing.approve(
      requestId,
      parseOptionalName(jsonBody(request, ctx.config.maxBodyBytes)),
    );
    request.log?.info(
      { admin_id: session.adminId, pair_request_id: requestId, device_id: result.device.id },
      "pair request approved",
    );
    return json(
      200,
      {
        credential: result.credential,
        device: {
          id: result.device.id,
          name: result.device.name,
          created_at: result.device.createdAt,
        },
      },
      NO_STORE,
    );
  }
  const reject = matchPath(path, "/admin/api/pair-requests/:id/reject");
  if (method === "POST" && reject) {
    const session = requireAdmin(request, ctx);
    const requestId = reject.id ?? "";
    ctx.pairing.reject(requestId);
    request.log?.info(
      { admin_id: session.adminId, pair_request_id: requestId },
      "pair request rejected",
    );
    return json(200, { ok: true }, NO_STORE);
  }
  if (method === "GET" && path === "/admin/api/devices") {
    requireAdmin(request, ctx);
    return json(
      200,
      {
        devices: ctx.devices.listDevices().map((device) =>
          presentAdminDevice(
            device,
            ctx.connections.get(device.id),
            ctx.activity.latestForDevice(device.id),
          ),
        ),
      },
      NO_STORE,
    );
  }
  const device = matchPath(path, "/admin/api/devices/:id");
  if (method === "GET" && device) {
    requireAdmin(request, ctx);
    const record = ctx.devices.requireDevice(device.id ?? "");
    return json(
      200,
      presentAdminDevice(
        record,
        ctx.connections.get(record.id),
        ctx.activity.latestForDevice(record.id),
      ),
      NO_STORE,
    );
  }
  const rename = matchPath(path, "/admin/api/devices/:id/rename");
  if (method === "POST" && rename) {
    const session = requireAdmin(request, ctx);
    const body = objectBody(jsonBody(request, ctx.config.maxBodyBytes));
    const record = ctx.devices.renameDevice(rename.id ?? "", requiredString(body, "name"));
    request.log?.info({ admin_id: session.adminId, device_id: record.id }, "device renamed");
    ctx.adminEvents.publish("devices");
    return json(
      200,
      presentAdminDevice(
        record,
        ctx.connections.get(record.id),
        ctx.activity.latestForDevice(record.id),
      ),
      NO_STORE,
    );
  }
  const command = matchPath(path, "/admin/api/devices/:id/commands");
  if (method === "POST" && command) {
    requireAdmin(request, ctx);
    const result = await ctx.commands.submit(
      command.id ?? "",
      jsonBody(request, ctx.config.maxBodyBytes),
      "dashboard",
    );
    return json(
      result.httpStatus,
      {
        status: result.payload.status,
        device_id: result.payload.device_id,
        command_id: result.payload.command_id,
        duration_ms: result.durationMs ?? null,
      },
      NO_STORE,
    );
  }
  const rotateDevice = matchPath(path, "/admin/api/devices/:id/credential/rotate");
  if (method === "POST" && rotateDevice) {
    const session = requireAdmin(request, ctx);
    const deviceId = rotateDevice.id ?? "";
    const rotated = ctx.devices.rotateDeviceCredential(deviceId);
    ctx.connections.closeDevice(
      deviceId,
      SocketClose.credentialRotated.code,
      SocketClose.credentialRotated.reason,
    );
    request.log?.info(
      { admin_id: session.adminId, device_id: deviceId },
      "device credential rotated",
    );
    ctx.adminEvents.publish("devices");
    return json(200, { credential: rotated.credential }, NO_STORE);
  }
  const disableDevice = matchPath(path, "/admin/api/devices/:id/disable");
  if (method === "POST" && disableDevice) {
    const session = requireAdmin(request, ctx);
    const record = ctx.devices.disableDevice(disableDevice.id ?? "");
    ctx.connections.closeDevice(
      record.id,
      SocketClose.deviceDisabled.code,
      SocketClose.deviceDisabled.reason,
    );
    request.log?.info(
      { admin_id: session.adminId, device_id: record.id },
      "device disabled",
    );
    ctx.adminEvents.publish("devices");
    return json(
      200,
      presentAdminDevice(record, undefined, ctx.activity.latestForDevice(record.id)),
      NO_STORE,
    );
  }
  const enableDevice = matchPath(path, "/admin/api/devices/:id/enable");
  if (method === "POST" && enableDevice) {
    const session = requireAdmin(request, ctx);
    const record = ctx.devices.enableDevice(enableDevice.id ?? "");
    request.log?.info({ admin_id: session.adminId, device_id: record.id }, "device enabled");
    ctx.adminEvents.publish("devices");
    return json(
      200,
      presentAdminDevice(
        record,
        ctx.connections.get(record.id),
        ctx.activity.latestForDevice(record.id),
      ),
      NO_STORE,
    );
  }
  if (method === "GET" && path === "/admin/api/tokens") {
    requireAdmin(request, ctx);
    return json(200, { tokens: ctx.devices.listTokens().map(presentAdminToken) }, NO_STORE);
  }
  if (method === "POST" && path === "/admin/api/tokens") {
    const session = requireAdmin(request, ctx);
    const created = ctx.devices.createCommandToken(
      parseTokenCreate(jsonBody(request, ctx.config.maxBodyBytes)),
    );
    request.log?.info(
      { admin_id: session.adminId, token_id: created.id, client_kind: created.clientKind },
      "command token created",
    );
    ctx.adminEvents.publish("tokens");
    return json(
      200,
      {
        id: created.id,
        name: created.name,
        permission: created.permission,
        client_kind: created.clientKind,
        device_id: created.deviceId,
        token: created.token,
        created_at: created.createdAt,
      },
      NO_STORE,
    );
  }
  const rotateToken = matchPath(path, "/admin/api/tokens/:id/rotate");
  if (method === "POST" && rotateToken) {
    const session = requireAdmin(request, ctx);
    const rotated = ctx.devices.rotateShortcutToken(rotateToken.id ?? "");
    request.log?.info(
      { admin_id: session.adminId, token_id: rotated.id },
      "shortcut token rotated",
    );
    ctx.adminEvents.publish("tokens");
    return json(
      200,
      {
        id: rotated.id,
        name: rotated.name,
        permission: rotated.permission,
        client_kind: rotated.clientKind,
        device_id: rotated.deviceId,
        token: rotated.token,
        created_at: rotated.createdAt,
      },
      NO_STORE,
    );
  }
  const disableToken = matchPath(path, "/admin/api/tokens/:id/disable");
  if (method === "POST" && disableToken) {
    const session = requireAdmin(request, ctx);
    const token = ctx.devices.disableToken(disableToken.id ?? "");
    request.log?.info(
      { admin_id: session.adminId, token_id: token.id },
      "shortcut token disabled",
    );
    ctx.adminEvents.publish("tokens");
    return json(200, presentAdminToken(token), NO_STORE);
  }
  const enableToken = matchPath(path, "/admin/api/tokens/:id/enable");
  if (method === "POST" && enableToken) {
    const session = requireAdmin(request, ctx);
    const token = ctx.devices.enableToken(enableToken.id ?? "");
    request.log?.info(
      { admin_id: session.adminId, token_id: token.id },
      "shortcut token enabled",
    );
    ctx.adminEvents.publish("tokens");
    return json(200, presentAdminToken(token), NO_STORE);
  }
  if (method === "GET" && path === "/admin/api/activity") {
    requireAdmin(request, ctx);
    return json(200, activityList(request, ctx), NO_STORE);
  }
  if (method === "GET" && path === "/admin/api/system") {
    requireAdmin(request, ctx);
    return json(
      200,
      {
        environment: ctx.config.env,
        public_url: ctx.config.publicUrl,
        protocol_version: PROTOCOL_VERSION,
        database: "sqlite",
        uptime_ms: nowMs() - ctx.startedAt,
        command_ttl_ms: ctx.config.commandTtlMs,
        heartbeat_stale_ms: ctx.config.heartbeatStaleMs,
      },
      NO_STORE,
    );
  }
  throw new AppError(ErrorCode.INVALID_REQUEST, "Not found.", 404);
}

function ready(ctx: AppContext): RelayHttpResult {
  if (!ctx.ready) {
    return json(503, { status: "not_ready" });
  }
  try {
    ctx.db.prepare("SELECT 1").get();
  } catch {
    return json(503, { status: "not_ready" });
  }
  return json(200, { status: "ok" });
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
  return {
    relay: {
      status: relayOperationalStatus(ctx),
      started_at: ctx.startedAt,
      uptime_ms: now - ctx.startedAt,
      protocol_version: PROTOCOL_VERSION,
    },
    devices: {
      total: devices.length,
      online,
      offline: devices.length - online,
    },
    commands: {
      completed_24h: counts.completed,
      failed_24h: counts.failed,
    },
    recent_activity: ctx.activity.recent().map((event) => {
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
    }),
  };
}

function activityList(request: RelayHttpRequest, ctx: AppContext) {
  const status = request.query.get("status") ?? undefined;
  const source = request.query.get("source") ?? undefined;
  if (status !== undefined && !isCommandEventStatus(status)) {
    throw invalidRequest("Invalid status filter.");
  }
  if (source !== undefined && !isCommandSource(source)) {
    throw invalidRequest("Invalid source filter.");
  }
  const filter: Partial<ActivityQuery> = {};
  const limit = optionalPositiveInt(request.query.get("limit"));
  const offset = optionalPositiveInt(request.query.get("offset"));
  if (limit !== undefined) {
    filter.limit = limit;
  }
  if (offset !== undefined) {
    filter.offset = offset;
  }
  const deviceId = request.query.get("device_id");
  if (deviceId !== null) {
    filter.deviceId = deviceId;
  }
  if (status !== undefined && isCommandEventStatus(status)) {
    filter.status = status;
  }
  if (source !== undefined && isCommandSource(source)) {
    filter.source = source;
  }
  const action = request.query.get("action");
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

function publicDeviceStatus(ctx: AppContext, deviceId: string): DeviceStatus {
  const device = ctx.devices.requireDevice(deviceId);
  const connection = ctx.connections.get(device.id);
  return {
    device_id: device.id,
    name: device.name,
    online: connection !== undefined,
    last_seen_at: device.lastSeenAt,
    platform: connection?.platform ?? device.platform,
    actions: [...(connection?.actions ?? device.actions ?? [])],
  };
}

function parseTokenCreate(body: unknown): {
  name: string;
  clientKind: CommandClientKind;
  deviceId: string;
} {
  const record = objectBody(body);
  if (record.device_ids !== undefined) {
    throw invalidRequest("device_id is required. A token is bound to one device.");
  }
  let clientKind: CommandClientKind = "shortcut";
  if (record.client_kind !== undefined) {
    if (typeof record.client_kind !== "string" || !isCommandClientKind(record.client_kind)) {
      throw invalidRequest("client_kind must be shortcut.");
    }
    clientKind = record.client_kind;
  }
  return {
    name: requiredString(record, "name"),
    clientKind,
    deviceId: requiredString(record, "device_id"),
  };
}

function requireAdmin(request: RelayHttpRequest, ctx: AppContext) {
  return ctx.sessions.authenticate(readCookie(request.headers.get("cookie"), ADMIN_SESSION_COOKIE));
}

function authorization(request: RelayHttpRequest): string | undefined {
  return request.headers.get("authorization") ?? undefined;
}

function readCookie(header: string | null, name: string): string | undefined {
  if (header === null) {
    return undefined;
  }
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    if (part.slice(0, separator).trim() !== name) {
      continue;
    }
    const value = decodeURIComponent(part.slice(separator + 1).trim());
    return value === "" ? undefined : value;
  }
  return undefined;
}

function jsonBody(request: RelayHttpRequest, maxBytes: number): unknown {
  if (request.hasParsedBody) {
    return request.parsedBody;
  }
  const text = request.rawBody ?? "";
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

function parseOptionalName(body: unknown): string | undefined {
  if (body === undefined || body === null || body === "") {
    return undefined;
  }
  const parsed = objectBody(body);
  const value = parsed.name;
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw invalidRequest("name must be a string.");
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

function json(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
  session?: SessionDirective,
): RelayHttpResult {
  return {
    kind: "json",
    status,
    body,
    ...(headers === undefined ? {} : { headers }),
    ...(session === undefined ? {} : { session }),
  };
}

export function matchPath(pathname: string, pattern: string): Record<string, string> | undefined {
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

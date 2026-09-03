import type { FastifyInstance, FastifyRequest } from "fastify";

import {
  isCommandEventStatus,
  type ActivityQuery,
} from "../activity/activityTypes.js";
import type { AppContext } from "../appContext.js";
import { isCommandSource } from "../commands/commandTypes.js";
import { PROTOCOL_VERSION } from "../config/constants.js";
import { AppError, ErrorCode, invalidRequest } from "../utils/errors.js";
import { nowMs } from "../utils/time.js";
import { writeAdminEventStream } from "./eventStream.js";
import {
  assertAdminMutationAllowed,
  authenticateAdminRequest,
  clearSessionCookie,
  setSessionCookie,
} from "./guards.js";
import { parseOptionalName } from "../pairing/pairRoutes.js";
import { presentAdminDevice } from "./presenters.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function requireAdmin(request: FastifyRequest, ctx: AppContext) {
  return authenticateAdminRequest(request, ctx.sessions);
}

function parseObjectBody(body: unknown): Record<string, unknown> {
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

function optionalPositiveInt(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed =
    typeof value === "string"
      ? Number.parseInt(value, 10)
      : typeof value === "number"
        ? value
        : Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw invalidRequest("Invalid numeric query parameter.");
  }
  return parsed;
}

export async function registerAdminRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  await app.register(
    async (admin) => {
      admin.addHook("onRequest", async (request) => {
        assertAdminMutationAllowed(request, ctx.config);
      });

      admin.addHook("onSend", async (_request, reply) => {
        reply.header("Cache-Control", "no-store");
      });

      admin.get("/session", async (request) => {
        const configured = ctx.admins.hasAny();
        try {
          const session = authenticateAdminRequest(request, ctx.sessions);
          return {
            authenticated: true,
            configured,
            user: {
              id: session.adminId,
              username: session.username,
            },
          };
        } catch (error) {
          if (
            error instanceof AppError &&
            (error.statusCode === 401 || error.statusCode === 403)
          ) {
            return { authenticated: false, configured };
          }
          throw error;
        }
      });

      admin.post("/session", async (request, reply) => {
        const source = request.ip;
        if (!ctx.adminLoginRateLimiter.consume(`admin-login:${source}`)) {
          request.log.warn({ source }, "admin login rate limited");
          throw new AppError(
            ErrorCode.RATE_LIMITED,
            "Too many sign-in attempts.",
            429,
          );
        }
        const body = parseObjectBody(request.body);
        const username = requiredString(body, "username");
        const password = requiredString(body, "password");
        if (!ctx.admins.hasAny()) {
          request.log.warn({ username }, "admin login failure");
          throw new AppError(
            ErrorCode.UNAUTHORIZED,
            "Invalid username or password.",
            401,
          );
        }
        try {
          const adminUser = ctx.admins.authenticate(username, password);
          const session = ctx.sessions.create(adminUser.id);
          ctx.admins.recordLogin(adminUser.id);
          setSessionCookie(reply, session.token, ctx.config, session.expiresAt);
          request.log.info(
            { admin_id: adminUser.id, username: adminUser.username },
            "admin login success",
          );
          return {
            authenticated: true,
            user: {
              id: adminUser.id,
              username: adminUser.username,
            },
          };
        } catch (error) {
          if (
            error instanceof AppError &&
            error.code === ErrorCode.ADMIN_DISABLED
          ) {
            request.log.warn({ username }, "admin disabled");
          } else {
            request.log.warn({ username }, "admin login failure");
          }
          throw error;
        }
      });

      admin.delete("/session", async (request, reply) => {
        try {
          const session = authenticateAdminRequest(request, ctx.sessions);
          ctx.sessions.revoke(session.sessionId);
          request.log.info(
            { admin_id: session.adminId, username: session.username },
            "admin logout",
          );
        } catch {
          // Clearing an already-invalid cookie is still a successful logout.
        }
        clearSessionCookie(reply, ctx.config);
        return { authenticated: false };
      });

      admin.post("/account/password", async (request) => {
        const session = requireAdmin(request, ctx);
        const body = parseObjectBody(request.body);
        const currentPassword = requiredString(body, "current_password");
        const newPassword = requiredString(body, "new_password");
        const adminUser = ctx.admins.requireById(session.adminId);
        ctx.admins.verifyCurrentPassword(adminUser, currentPassword);
        ctx.admins.setPassword(adminUser.id, newPassword);
        ctx.sessions.revokeAllForAdmin(adminUser.id, session.sessionId);
        request.log.info(
          { admin_id: adminUser.id, username: adminUser.username },
          "admin password changed",
        );
        return { ok: true };
      });

      admin.get("/events", async (request, reply) => {
        requireAdmin(request, ctx);
        writeAdminEventStream(request, reply, ctx.adminEvents);
      });

      admin.get("/overview", async (request) => {
        requireAdmin(request, ctx);
        const now = nowMs();
        const devices = ctx.devices.listDevices();
        let online = 0;
        for (const device of devices) {
          if (ctx.connections.isOnline(device.id)) {
            online += 1;
          }
        }
        const since = now - DAY_MS;
        const counts = ctx.activity.countsSince(since);
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
          devices: {
            total: devices.length,
            online,
            offline: devices.length - online,
          },
          commands: {
            completed_24h: counts.completed,
            failed_24h: counts.failed,
          },
          recent_activity: recent,
        };
      });

      admin.get("/pair-requests", async (request) => {
        requireAdmin(request, ctx);
        return { requests: ctx.pairing.listPending() };
      });

      admin.post("/pair-requests/:id/approve", async (request) => {
        const session = requireAdmin(request, ctx);
        const params = request.params as { id: string };
        const result = ctx.pairing.approve(
          params.id,
          parseOptionalName(request.body),
        );
        request.log.info(
          {
            admin_id: session.adminId,
            pair_request_id: params.id,
            device_id: result.device.id,
          },
          "pair request approved",
        );
        return {
          credential: result.credential,
          device: {
            id: result.device.id,
            name: result.device.name,
            created_at: result.device.createdAt,
          },
        };
      });

      admin.post("/pair-requests/:id/reject", async (request) => {
        const session = requireAdmin(request, ctx);
        const params = request.params as { id: string };
        ctx.pairing.reject(params.id);
        request.log.info(
          { admin_id: session.adminId, pair_request_id: params.id },
          "pair request rejected",
        );
        return { ok: true };
      });

      admin.get("/devices", async (request) => {
        requireAdmin(request, ctx);
        return {
          devices: ctx.devices
            .listDevices()
            .map((device) =>
              presentAdminDevice(
                device,
                ctx.connections.get(device.id),
                ctx.activity.latestForDevice(device.id),
              ),
            ),
        };
      });

      admin.get("/devices/:id", async (request) => {
        requireAdmin(request, ctx);
        const params = request.params as { id: string };
        const device = ctx.devices.requireDevice(params.id);
        return presentAdminDevice(
          device,
          ctx.connections.get(device.id),
          ctx.activity.latestForDevice(device.id),
        );
      });

      admin.post("/devices/:id/rename", async (request) => {
        const session = requireAdmin(request, ctx);
        const params = request.params as { id: string };
        const body = parseObjectBody(request.body);
        const device = ctx.devices.renameDevice(
          params.id,
          requiredString(body, "name"),
        );
        request.log.info(
          { admin_id: session.adminId, device_id: device.id },
          "device renamed",
        );
        ctx.adminEvents.publish("devices");
        return presentAdminDevice(
          device,
          ctx.connections.get(device.id),
          ctx.activity.latestForDevice(device.id),
        );
      });

      admin.post("/devices/:id/commands", async (request, reply) => {
        requireAdmin(request, ctx);
        const params = request.params as { id: string };
        const result = await ctx.commands.submit(
          params.id,
          request.body,
          "dashboard",
        );
        return reply.code(result.httpStatus).send({
          status: result.payload.status,
          device_id: result.payload.device_id,
          command_id: result.payload.command_id,
          duration_ms: result.durationMs ?? null,
        });
      });

      admin.post("/devices/:id/credential/rotate", async (request) => {
        const session = requireAdmin(request, ctx);
        const params = request.params as { id: string };
        const rotated = ctx.devices.rotateDeviceCredential(params.id);
        ctx.connections.closeDevice(params.id, 1000, "credential_rotated");
        request.log.info(
          { admin_id: session.adminId, device_id: params.id },
          "device credential rotated",
        );
        ctx.adminEvents.publish("devices");
        return { credential: rotated.credential };
      });

      admin.post("/devices/:id/disable", async (request) => {
        const session = requireAdmin(request, ctx);
        const params = request.params as { id: string };
        const device = ctx.devices.disableDevice(params.id);
        ctx.connections.closeDevice(params.id, 1000, "device_disabled");
        request.log.info(
          { admin_id: session.adminId, device_id: device.id },
          "device disabled",
        );
        ctx.adminEvents.publish("devices");
        return presentAdminDevice(
          device,
          undefined,
          ctx.activity.latestForDevice(device.id),
        );
      });

      admin.post("/devices/:id/enable", async (request) => {
        const session = requireAdmin(request, ctx);
        const params = request.params as { id: string };
        const device = ctx.devices.enableDevice(params.id);
        request.log.info(
          { admin_id: session.adminId, device_id: device.id },
          "device enabled",
        );
        ctx.adminEvents.publish("devices");
        return presentAdminDevice(
          device,
          ctx.connections.get(device.id),
          ctx.activity.latestForDevice(device.id),
        );
      });

      admin.get("/tokens", async (request) => {
        requireAdmin(request, ctx);
        return {
          tokens: ctx.devices.listTokens().map((token) => ({
            id: token.id,
            name: token.name,
            permission: token.permission,
            enabled: token.enabled,
            created_at: token.createdAt,
            last_used_at: token.lastUsedAt,
          })),
        };
      });

      admin.post("/tokens", async (request) => {
        const session = requireAdmin(request, ctx);
        const body = parseObjectBody(request.body);
        const created = ctx.devices.createShortcutToken(
          requiredString(body, "name"),
        );
        request.log.info(
          { admin_id: session.adminId, token_id: created.id },
          "shortcut token created",
        );
        ctx.adminEvents.publish("tokens");
        return {
          id: created.id,
          name: created.name,
          permission: created.permission,
          token: created.token,
          created_at: created.createdAt,
        };
      });

      admin.post("/tokens/:id/rotate", async (request) => {
        const session = requireAdmin(request, ctx);
        const params = request.params as { id: string };
        const rotated = ctx.devices.rotateShortcutToken(params.id);
        request.log.info(
          { admin_id: session.adminId, token_id: rotated.id },
          "shortcut token rotated",
        );
        ctx.adminEvents.publish("tokens");
        return {
          id: rotated.id,
          name: rotated.name,
          permission: rotated.permission,
          token: rotated.token,
          created_at: rotated.createdAt,
        };
      });

      admin.post("/tokens/:id/disable", async (request) => {
        const session = requireAdmin(request, ctx);
        const params = request.params as { id: string };
        const token = ctx.devices.disableToken(params.id);
        request.log.info(
          { admin_id: session.adminId, token_id: token.id },
          "shortcut token disabled",
        );
        ctx.adminEvents.publish("tokens");
        return {
          id: token.id,
          name: token.name,
          permission: token.permission,
          enabled: token.enabled,
          created_at: token.createdAt,
          last_used_at: token.lastUsedAt,
        };
      });

      admin.post("/tokens/:id/enable", async (request) => {
        const session = requireAdmin(request, ctx);
        const params = request.params as { id: string };
        const token = ctx.devices.enableToken(params.id);
        request.log.info(
          { admin_id: session.adminId, token_id: token.id },
          "shortcut token enabled",
        );
        ctx.adminEvents.publish("tokens");
        return {
          id: token.id,
          name: token.name,
          permission: token.permission,
          enabled: token.enabled,
          created_at: token.createdAt,
          last_used_at: token.lastUsedAt,
        };
      });

      admin.get("/activity", async (request) => {
        requireAdmin(request, ctx);
        const query = request.query as Record<string, string | undefined>;
        if (query.status !== undefined && !isCommandEventStatus(query.status)) {
          throw invalidRequest("Invalid status filter.");
        }
        if (query.source !== undefined && !isCommandSource(query.source)) {
          throw invalidRequest("Invalid source filter.");
        }
        const filter: Partial<ActivityQuery> = {};
        const limit = optionalPositiveInt(query.limit);
        const offset = optionalPositiveInt(query.offset);
        if (limit !== undefined) {
          filter.limit = limit;
        }
        if (offset !== undefined) {
          filter.offset = offset;
        }
        if (query.device_id !== undefined) {
          filter.deviceId = query.device_id;
        }
        if (query.status !== undefined && isCommandEventStatus(query.status)) {
          filter.status = query.status;
        }
        if (query.source !== undefined && isCommandSource(query.source)) {
          filter.source = query.source;
        }
        if (query.action !== undefined) {
          filter.action = query.action;
        }
        const events = ctx.activity.list(filter);
        return {
          events: events.map((event) => {
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
      });

      admin.get("/system", async (request) => {
        requireAdmin(request, ctx);
        return {
          environment: ctx.config.env,
          public_url: ctx.config.publicUrl,
          protocol_version: PROTOCOL_VERSION,
          database: "sqlite",
          uptime_ms: nowMs() - ctx.startedAt,
          command_ttl_ms: ctx.config.commandTtlMs,
          heartbeat_stale_ms: ctx.config.heartbeatStaleMs,
        };
      });
    },
    { prefix: "/admin/api" },
  );
}

export function relayOperationalStatus(
  ctx: AppContext,
): "operational" | "unavailable" {
  if (!ctx.ready) {
    return "unavailable";
  }
  try {
    ctx.db.prepare("SELECT 1").get();
  } catch {
    return "unavailable";
  }
  return "operational";
}

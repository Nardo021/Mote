import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import Fastify from "fastify";

import { registerRoutes } from "./api/routes.js";
import { bindCommandLogger, type AppContext } from "./appContext.js";
import {
  DEVICE_WEBSOCKET_PATH,
  PAIR_WEBSOCKET_PATH,
} from "./config/constants.js";
import { loggerOptions } from "./utils/logger.js";
import { AppError, ErrorCode, toErrorEnvelope } from "./utils/errors.js";
import { handlePairSocket } from "./pairing/pairSocket.js";
import { handleDeviceSocket } from "./websocket/deviceSocket.js";
import { startStaleConnectionSweeper } from "./websocket/heartbeat.js";
import { nowMs } from "./utils/time.js";

function errorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return undefined;
}

function errorStatusCode(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }
  return undefined;
}

export async function buildApp(ctx: AppContext) {
  const app = Fastify({
    logger: loggerOptions(ctx.config),
    bodyLimit: ctx.config.maxBodyBytes,
    trustProxy: false,
  });

  bindCommandLogger(ctx, {
    info: (obj, msg) => {
      app.log.info(obj, msg);
    },
    warn: (obj, msg) => {
      app.log.warn(obj, msg);
    },
  });

  await app.register(cookie);
  await app.register(websocket);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send(toErrorEnvelope(error));
    }
    const statusCode = errorStatusCode(error);
    const code = errorCode(error);
    if (
      statusCode === 400 ||
      code === "FST_ERR_CTP_INVALID_MEDIA_TYPE" ||
      code === "FST_ERR_CTP_EMPTY_JSON_BODY"
    ) {
      return reply
        .code(400)
        .send(
          toErrorEnvelope(
            new AppError(ErrorCode.INVALID_REQUEST, "Invalid request.", 400),
          ),
        );
    }
    if (code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      return reply
        .code(413)
        .send(
          toErrorEnvelope(
            new AppError(
              ErrorCode.INVALID_REQUEST,
              "Request body is too large.",
              413,
            ),
          ),
        );
    }
    request.log.error({ err: error }, "unexpected error");
    return reply
      .code(500)
      .send(
        toErrorEnvelope(
          new AppError(
            ErrorCode.INTERNAL_ERROR,
            "Unexpected server failure.",
            500,
          ),
        ),
      );
  });

  await registerRoutes(app, ctx);

  app.setNotFoundHandler((_request, reply) => {
    return reply
      .code(404)
      .send(
        toErrorEnvelope(
          new AppError(ErrorCode.INVALID_REQUEST, "Not found.", 404),
        ),
      );
  });

  app.get(DEVICE_WEBSOCKET_PATH, { websocket: true }, (socket, request) => {
    handleDeviceSocket(socket, { ip: request.ip, log: request.log }, ctx);
  });

  app.get(PAIR_WEBSOCKET_PATH, { websocket: true }, (socket, request) => {
    handlePairSocket(socket, request, ctx);
  });

  const sessionCleanup = setInterval(
    () => {
      ctx.sessions.purgeExpired();
    },
    60 * 60 * 1000,
  );
  sessionCleanup.unref?.();

  const sweeper = startStaleConnectionSweeper(
    ctx.connections,
    ctx.config.heartbeatStaleMs,
    ctx.config.staleSweepIntervalMs,
    (connection) => {
      app.log.warn(
        {
          device_id: connection.deviceId,
          connection_id: connection.connectionId,
        },
        "stale device connection",
      );
      try {
        connection.socket.close(1001, "heartbeat_stale");
      } catch {
        // ignore
      }
      if (
        ctx.connections.remove(connection.deviceId, connection.connectionId)
      ) {
        ctx.devices.markLastSeen(connection.deviceId, nowMs());
        ctx.lastSeen.clear(connection.deviceId);
        app.log.info({ device_id: connection.deviceId }, "device disconnected");
        ctx.adminEvents.publish("devices");
      }
    },
  );

  app.addHook("onClose", async () => {
    clearInterval(sessionCleanup);
    sweeper.stop();
    ctx.pending.failAll();
    ctx.connections.closeAll();
    ctx.ready = false;
  });

  return app;
}

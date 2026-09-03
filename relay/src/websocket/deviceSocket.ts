import type { WebSocket } from "ws";

import type { AppContext } from "../appContext.js";
import { authenticateDevice } from "../auth/deviceAuth.js";
import { encodeOutgoing, parseIncomingDeviceMessage, rawDataToString } from "../protocol/codec.js";
import { createConnectionId } from "../utils/ids.js";
import { nowMs } from "../utils/time.js";
import type { DeviceConnection } from "./connectionRegistry.js";
import { createHeartbeatAck } from "./heartbeat.js";
import { authResultError, authResultOk } from "./socketAuthentication.js";

export type SocketRequestLog = {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
};

export type DeviceSocketRequest = {
  ip: string;
  log: SocketRequestLog;
};

function persistLastSeen(ctx: AppContext, deviceId: string, at: number, force: boolean): void {
  if (!force && !ctx.lastSeen.shouldPersist(deviceId, at)) {
    return;
  }
  ctx.devices.markLastSeen(deviceId, at);
  ctx.lastSeen.markPersisted(deviceId, at);
}

function sendAndClose(socket: WebSocket, error: string): void {
  try {
    socket.send(encodeOutgoing(authResultError(error)));
  } catch {
    // socket may already be closing
  }
  socket.close(1008, error);
}

export function handleDeviceSocket(socket: WebSocket, request: DeviceSocketRequest, ctx: AppContext): void {
  const connectionId = createConnectionId();
  const remoteAddress = request.ip;
  let authenticated: DeviceConnection | undefined;
  let settled = false;

  const authTimer = setTimeout(() => {
    if (!authenticated && !settled) {
      settled = true;
      request.log.info({ connection_id: connectionId }, "websocket auth timeout");
      socket.close(1008, "auth_timeout");
    }
  }, ctx.config.authTimeoutMs);

  request.log.info({ connection_id: connectionId, remote_address: remoteAddress }, "websocket opened");

  socket.on("message", (raw) => {
    const parsed = parseIncomingDeviceMessage(rawDataToString(raw));

    if (!authenticated) {
      if (settled) {
        return;
      }
      if (!parsed.ok || parsed.message.type !== "auth") {
        settled = true;
        clearTimeout(authTimer);
        request.log.warn({ connection_id: connectionId }, "authentication failed");
        sendAndClose(socket, "invalid_credentials");
        return;
      }
      const result = authenticateDevice(parsed.message, ctx.deviceRepository);
      if (!result.ok) {
        settled = true;
        clearTimeout(authTimer);
        request.log.warn({ connection_id: connectionId, error: result.error }, "authentication failed");
        sendAndClose(socket, result.error);
        return;
      }

      clearTimeout(authTimer);
      const at = nowMs();
      const connection: DeviceConnection = {
        deviceId: result.device.id,
        connectionId,
        socket,
        authenticatedAt: at,
        lastHeartbeat: at,
        lastSeen: at,
        remoteAddress,
      };
      const previous = ctx.connections.register(connection);
      if (previous && previous.connectionId !== connectionId) {
        request.log.info(
          { device_id: result.device.id, previous_connection_id: previous.connectionId },
          "superseding device connection",
        );
        try {
          previous.socket.close(1000, "superseded");
        } catch {
          // ignore
        }
      }
      authenticated = connection;
      persistLastSeen(ctx, result.device.id, at, true);
      if (parsed.message.app_version !== undefined) {
        ctx.devices.recordAppVersion(result.device.id, parsed.message.app_version);
      }
      socket.send(encodeOutgoing(authResultOk()));
      request.log.info({ device_id: result.device.id, connection_id: connectionId }, "device authenticated");
      request.log.info({ device_id: result.device.id, connection_id: connectionId }, "device connected");
      return;
    }

    if (!parsed.ok) {
      if (parsed.reason === "unknown_type") {
        return;
      }
      request.log.warn(
        { device_id: authenticated.deviceId, reason: parsed.reason },
        "malformed websocket message",
      );
      return;
    }

    switch (parsed.message.type) {
      case "auth":
        return;
      case "heartbeat": {
        if (parsed.message.device_id !== authenticated.deviceId) {
          request.log.warn({ device_id: authenticated.deviceId }, "heartbeat device_id mismatch");
          return;
        }
        const serverAt = nowMs();
        ctx.connections.touch(authenticated.deviceId, authenticated.connectionId, serverAt);
        persistLastSeen(ctx, authenticated.deviceId, serverAt, false);
        socket.send(encodeOutgoing(createHeartbeatAck(parsed.message.sent_at, serverAt)));
        return;
      }
      case "command_result": {
        const resolved = ctx.pending.resolve(parsed.message);
        if (resolved) {
          request.log.info(
            { device_id: authenticated.deviceId, command_id: parsed.message.command_id, status: parsed.message.status },
            "command result received",
          );
        }
        return;
      }
      default: {
        const _exhaustive: never = parsed.message;
        return _exhaustive;
      }
    }
  });

  const cleanup = (): void => {
    clearTimeout(authTimer);
    if (!authenticated) {
      return;
    }
    const removed = ctx.connections.remove(authenticated.deviceId, authenticated.connectionId);
    if (!removed) {
      return;
    }
    persistLastSeen(ctx, authenticated.deviceId, nowMs(), true);
    ctx.lastSeen.clear(authenticated.deviceId);
    request.log.info(
      { device_id: authenticated.deviceId, connection_id: authenticated.connectionId },
      "device disconnected",
    );
  };

  socket.on("close", cleanup);
  socket.on("error", () => {
    request.log.warn({ connection_id: connectionId, device_id: authenticated?.deviceId }, "websocket error");
    try {
      socket.close(1011, "socket_error");
    } catch {
      // ignore
    }
  });
}

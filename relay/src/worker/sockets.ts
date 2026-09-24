import type { AppContext } from "../appContext.js";
import { authenticateDevice } from "../auth/deviceAuth.js";
import { AppError } from "../utils/errors.js";
import { createConnectionId } from "../utils/ids.js";
import { encodeOutgoing, parseIncomingDeviceMessage, rawDataToString } from "../protocol/codec.js";
import { nowMs } from "../utils/time.js";
import type { DeviceConnection, RelaySocket } from "../websocket/connectionRegistry.js";
import { createHeartbeatAck } from "../websocket/heartbeat.js";
import { authResultError, authResultOk } from "../websocket/socketAuthentication.js";

export type DeviceAttachment = {
  kind: "device";
  connectionId: string;
  remoteAddress: string;
  openedAt: number;
  deviceId?: string;
  authenticatedAt?: number;
  lastHeartbeat?: number;
};

export type PairAttachment = {
  kind: "pair";
  requestId: string;
  expiresAt: number;
};

export type SocketAttachment = DeviceAttachment | PairAttachment;

export type HibernatingSocket = RelaySocket & {
  serializeAttachment(value: SocketAttachment): void;
  deserializeAttachment(): SocketAttachment | null;
};

export function deviceAttachment(remoteAddress: string): DeviceAttachment {
  return {
    kind: "device",
    connectionId: createConnectionId(),
    remoteAddress,
    openedAt: nowMs(),
  };
}

export function acceptPairSocket(
  socket: HibernatingSocket,
  ctx: AppContext,
  requestId: string | null,
  pairSecret: string | null,
): void {
  if (requestId === null || requestId === "" || pairSecret === null || pairSecret === "") {
    socket.close(1008, "invalid_credentials");
    return;
  }
  let record;
  try {
    record = ctx.pairing.authenticateSocket(requestId, pairSecret);
  } catch (error) {
    socket.close(error instanceof AppError ? 1008 : 1011, error instanceof AppError ? "invalid_credentials" : "socket_error");
    return;
  }
  const attachment: PairAttachment = {
    kind: "pair",
    requestId: record.id,
    expiresAt: record.expiresAt,
  };
  socket.serializeAttachment(attachment);
  const previous = ctx.pairSockets.register(record.id, socket);
  if (previous && previous !== socket) {
    try {
      previous.close(1000, "superseded");
    } catch {
      // ignore
    }
  }
  ctx.pairSockets.send(record.id, { type: "pair_pending", version: 1 });
}

export function restoreSocket(socket: HibernatingSocket, ctx: AppContext): void {
  const attachment = socket.deserializeAttachment();
  if (attachment === null) {
    return;
  }
  if (attachment.kind === "pair") {
    ctx.pairSockets.register(attachment.requestId, socket);
    return;
  }
  if (attachment.deviceId === undefined || attachment.authenticatedAt === undefined) {
    return;
  }
  const connection: DeviceConnection = {
    deviceId: attachment.deviceId,
    connectionId: attachment.connectionId,
    socket,
    authenticatedAt: attachment.authenticatedAt,
    lastHeartbeat: attachment.lastHeartbeat ?? attachment.authenticatedAt,
    lastSeen: attachment.lastHeartbeat ?? attachment.authenticatedAt,
    remoteAddress: attachment.remoteAddress,
  };
  ctx.connections.register(connection);
}

export function onDeviceMessage(socket: HibernatingSocket, ctx: AppContext, raw: unknown): void {
  const attachment = socket.deserializeAttachment();
  if (attachment === null || attachment.kind !== "device") {
    return;
  }
  const parsed = parseIncomingDeviceMessage(rawDataToString(raw));
  if (attachment.deviceId === undefined) {
    if (!parsed.ok || parsed.message.type !== "auth") {
      sendAndClose(socket, "invalid_credentials");
      return;
    }
    const result = authenticateDevice(parsed.message, ctx.deviceRepository);
    if (!result.ok) {
      sendAndClose(socket, result.error);
      return;
    }
    const at = nowMs();
    const connection: DeviceConnection = {
      deviceId: result.device.id,
      connectionId: attachment.connectionId,
      socket,
      authenticatedAt: at,
      lastHeartbeat: at,
      lastSeen: at,
      remoteAddress: attachment.remoteAddress,
    };
    const previous = ctx.connections.register(connection);
    if (previous && previous.connectionId !== connection.connectionId) {
      try {
        previous.socket.close(1000, "superseded");
      } catch {
        // ignore
      }
    }
    const next: DeviceAttachment = {
      ...attachment,
      deviceId: result.device.id,
      authenticatedAt: at,
      lastHeartbeat: at,
    };
    socket.serializeAttachment(next);
    ctx.devices.markLastSeen(result.device.id, at);
    ctx.lastSeen.markPersisted(result.device.id, at);
    if (parsed.message.app_version !== undefined) {
      ctx.devices.recordAppVersion(result.device.id, parsed.message.app_version);
    }
    socket.send(encodeOutgoing(authResultOk()));
    ctx.adminEvents.publish("devices");
    return;
  }

  const authenticated = ctx.connections.get(attachment.deviceId);
  if (!authenticated || authenticated.connectionId !== attachment.connectionId) {
    return;
  }
  if (!parsed.ok) {
    return;
  }
  switch (parsed.message.type) {
    case "auth":
      return;
    case "heartbeat": {
      if (parsed.message.device_id !== authenticated.deviceId) {
        return;
      }
      const serverAt = nowMs();
      ctx.connections.touch(authenticated.deviceId, authenticated.connectionId, serverAt);
      socket.serializeAttachment({ ...attachment, lastHeartbeat: serverAt });
      if (ctx.lastSeen.shouldPersist(authenticated.deviceId, serverAt)) {
        ctx.devices.markLastSeen(authenticated.deviceId, serverAt);
        ctx.lastSeen.markPersisted(authenticated.deviceId, serverAt);
      }
      socket.send(encodeOutgoing(createHeartbeatAck(parsed.message.sent_at, serverAt)));
      return;
    }
    case "command_result": {
      ctx.pending.resolve(parsed.message);
      return;
    }
    default: {
      const _exhaustive: never = parsed.message;
      return _exhaustive;
    }
  }
}

export function onSocketClose(socket: HibernatingSocket, ctx: AppContext): void {
  const attachment = socket.deserializeAttachment();
  if (attachment === null) {
    return;
  }
  if (attachment.kind === "pair") {
    ctx.pairSockets.remove(attachment.requestId, socket);
    return;
  }
  if (attachment.deviceId === undefined) {
    return;
  }
  if (!ctx.connections.remove(attachment.deviceId, attachment.connectionId)) {
    return;
  }
  const at = nowMs();
  ctx.devices.markLastSeen(attachment.deviceId, at);
  ctx.lastSeen.clear(attachment.deviceId);
  ctx.adminEvents.publish("devices");
}

export function sweepSockets(sockets: readonly HibernatingSocket[], ctx: AppContext): void {
  const now = nowMs();
  ctx.sessions.purgeExpired();
  ctx.pairing.expireStale();
  for (const socket of sockets) {
    const attachment = socket.deserializeAttachment();
    if (attachment === null) {
      socket.close(1008, "invalid_credentials");
      continue;
    }
    if (attachment.kind === "pair") {
      if (now >= attachment.expiresAt) {
        socket.close(1000, "expired");
      }
      continue;
    }
    if (attachment.deviceId === undefined) {
      if (now - attachment.openedAt > ctx.config.authTimeoutMs) {
        socket.close(1008, "auth_timeout");
      }
      continue;
    }
    const lastHeartbeat = attachment.lastHeartbeat ?? attachment.authenticatedAt ?? attachment.openedAt;
    if (now - lastHeartbeat > ctx.config.heartbeatStaleMs) {
      socket.close(1001, "heartbeat_stale");
    }
  }
}

function sendAndClose(socket: HibernatingSocket, error: string): void {
  try {
    socket.send(encodeOutgoing(authResultError(error)));
  } catch {
    // socket may already be closing
  }
  socket.close(1008, error);
}

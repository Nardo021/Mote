import type { AppContext } from "../appContext.js";
import { authenticateDevice } from "../auth/deviceAuth.js";
import { createConnectionId } from "../utils/ids.js";
import { encodeOutgoing, parseIncomingDeviceMessage, rawDataToString } from "../protocol/codec.js";
import { nowMs } from "../utils/time.js";
import type { DeviceConnection, RelaySocket } from "../websocket/connectionRegistry.js";
import { createHeartbeatAck } from "../websocket/heartbeat.js";
import { rememberAgentProfile } from "../websocket/agentProfile.js";
import { DEFAULT_DEVICE_ACTIONS, type DevicePlatform } from "../protocol/actions.js";
import { SocketClose } from "../protocol/closeReasons.js";
import { acceptCommandResult } from "../commands/pendingCommands.js";
import { authenticatePairingFrame, PAIR_AUTH_CLOSE, registerAuthenticatedPairSocket } from "../pairing/pairAuth.js";
import { authResultError, authResultOk } from "../websocket/socketAuthentication.js";

export type DeviceAttachment = {
  kind: "device";
  connectionId: string;
  remoteAddress: string;
  openedAt: number;
  deviceId?: string;
  authenticatedAt?: number;
  lastHeartbeat?: number;
  platform?: DevicePlatform | null;
  actions?: string[];
};

export type PairAttachment = {
  kind: "pair";
  openedAt: number;
  requestId?: string;
  expiresAt?: number;
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

export function beginPairSocket(socket: HibernatingSocket): void {
  socket.serializeAttachment({
    kind: "pair",
    openedAt: nowMs(),
  });
}

export function onPairMessage(socket: HibernatingSocket, ctx: AppContext, raw: unknown): void {
  const attachment = socket.deserializeAttachment();
  if (attachment === null || attachment.kind !== "pair" || attachment.requestId !== undefined) {
    return;
  }
  const authenticated = authenticatePairingFrame(ctx, rawDataToString(raw));
  if (!authenticated.ok) {
    ctx.securityLog.warn({}, "pair authentication failed");
    socket.close(authenticated.close.code, authenticated.close.reason);
    return;
  }
  const next: PairAttachment = {
    kind: "pair",
    openedAt: attachment.openedAt,
    requestId: authenticated.record.id,
    expiresAt: authenticated.record.expiresAt,
  };
  socket.serializeAttachment(next);
  registerAuthenticatedPairSocket(ctx, socket, authenticated.record);
  ctx.securityLog.info({ pair_request_id: authenticated.record.id }, "pair socket authenticated");
}

export function restoreSocket(socket: HibernatingSocket, ctx: AppContext): void {
  const attachment = socket.deserializeAttachment();
  if (attachment === null) {
    return;
  }
  if (attachment.kind === "pair") {
    if (attachment.requestId !== undefined) {
      ctx.pairSockets.register(attachment.requestId, socket);
    }
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
    platform: attachment.platform ?? null,
    actions: attachment.actions ?? [...DEFAULT_DEVICE_ACTIONS],
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
    const profile = rememberAgentProfile(ctx, result.device.id, parsed.message);
    const connection: DeviceConnection = {
      deviceId: result.device.id,
      connectionId: attachment.connectionId,
      socket,
      authenticatedAt: at,
      lastHeartbeat: at,
      lastSeen: at,
      remoteAddress: attachment.remoteAddress,
      platform: profile.platform,
      actions: profile.actions,
    };
    const previous = ctx.connections.register(connection);
    if (previous && previous.connectionId !== connection.connectionId) {
      try {
        previous.socket.close(SocketClose.superseded.code, SocketClose.superseded.reason);
      } catch {
        // ignore
      }
    }
    const next: DeviceAttachment = {
      ...attachment,
      deviceId: result.device.id,
      authenticatedAt: at,
      lastHeartbeat: at,
      platform: profile.platform,
      actions: profile.actions,
    };
    socket.serializeAttachment(next);
    ctx.devices.markLastSeen(result.device.id, at);
    ctx.lastSeen.markPersisted(result.device.id, at);
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
      acceptCommandResult(ctx.pending, parsed.message, authenticated.deviceId, ctx.securityLog);
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
    if (attachment.requestId !== undefined) {
      ctx.pairSockets.remove(attachment.requestId, socket);
    }
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
      socket.close(SocketClose.invalidCredentials.code, SocketClose.invalidCredentials.reason);
      continue;
    }
    if (attachment.kind === "pair") {
      if (attachment.requestId === undefined) {
        if (now - attachment.openedAt > ctx.config.authTimeoutMs) {
          socket.close(PAIR_AUTH_CLOSE.authTimeout.code, PAIR_AUTH_CLOSE.authTimeout.reason);
        }
        continue;
      }
      if (attachment.expiresAt !== undefined && now >= attachment.expiresAt) {
        socket.close(SocketClose.expired.code, SocketClose.expired.reason);
      }
      continue;
    }
    if (attachment.deviceId === undefined) {
      if (now - attachment.openedAt > ctx.config.authTimeoutMs) {
        socket.close(SocketClose.authTimeout.code, SocketClose.authTimeout.reason);
      }
      continue;
    }
    const lastHeartbeat = attachment.lastHeartbeat ?? attachment.authenticatedAt ?? attachment.openedAt;
    if (now - lastHeartbeat > ctx.config.heartbeatStaleMs) {
      socket.close(SocketClose.heartbeatStale.code, SocketClose.heartbeatStale.reason);
    }
  }
}

function sendAndClose(socket: HibernatingSocket, error: string): void {
  try {
    socket.send(encodeOutgoing(authResultError(error)));
  } catch {
    // socket may already be closing
  }
  const close =
    error === SocketClose.unsupportedVersion.reason
      ? SocketClose.unsupportedVersion
      : SocketClose.invalidCredentials;
  socket.close(close.code, close.reason);
}

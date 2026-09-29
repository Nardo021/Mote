import type { LastCommandSummary } from "../activity/activityTypes.js";
import type { DeviceRecord } from "../devices/deviceTypes.js";
import type { CommandClientKind } from "../devices/tokenTypes.js";
import type { DeviceConnection } from "../websocket/connectionRegistry.js";

export type AdminLastCommand = {
  command_id: string;
  action: string;
  status: string;
  source: string;
  created_at: number;
  duration_ms: number | null;
  error_code: string | null;
};

export type AdminDevice = {
  id: string;
  name: string;
  enabled: boolean;
  online: boolean;
  connected_at: number | null;
  last_seen_at: number | null;
  last_heartbeat_at: number | null;
  app_version: string | null;
  platform: string | null;
  actions: string[];
  created_at: number;
  updated_at: number;
  last_command: AdminLastCommand | null;
};

export type PresentedToken = {
  id: string;
  name: string;
  permission: string;
  client_kind: CommandClientKind;
  device_id: string | null;
  enabled: boolean;
  created_at: number;
  last_used_at: number | null;
};

export function presentAdminToken(token: {
  id: string;
  name: string;
  permission: string;
  clientKind: CommandClientKind;
  deviceId: string | null;
  enabled: boolean;
  createdAt: number;
  lastUsedAt: number | null;
}): PresentedToken {
  return {
    id: token.id,
    name: token.name,
    permission: token.permission,
    client_kind: token.clientKind,
    device_id: token.deviceId,
    enabled: token.enabled,
    created_at: token.createdAt,
    last_used_at: token.lastUsedAt,
  };
}

export function presentLastCommand(
  command: LastCommandSummary | undefined,
): AdminLastCommand | null {
  if (command === undefined) {
    return null;
  }
  return {
    command_id: command.command_id,
    action: command.action,
    status: command.status,
    source: command.source,
    created_at: command.created_at,
    duration_ms: command.duration_ms,
    error_code: command.error_code,
  };
}

export function presentAdminDevice(
  device: DeviceRecord,
  connection: DeviceConnection | undefined,
  lastCommand: LastCommandSummary | undefined,
): AdminDevice {
  return {
    id: device.id,
    name: device.name,
    enabled: device.enabled,
    online: connection !== undefined,
    connected_at: connection?.authenticatedAt ?? null,
    last_seen_at: device.lastSeenAt,
    last_heartbeat_at: connection?.lastHeartbeat ?? null,
    app_version: device.appVersion,
    platform: connection?.platform ?? device.platform,
    actions: [...(connection?.actions ?? device.actions ?? [])],
    created_at: device.createdAt,
    updated_at: device.updatedAt,
    last_command: presentLastCommand(lastCommand),
  };
}

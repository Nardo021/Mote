import type { LastCommandSummary } from "../activity/activityTypes.js";
import type { DeviceRecord } from "../devices/deviceTypes.js";
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
  created_at: number;
  updated_at: number;
  last_command: AdminLastCommand | null;
};

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
    created_at: device.createdAt,
    updated_at: device.updatedAt,
    last_command: presentLastCommand(lastCommand),
  };
}

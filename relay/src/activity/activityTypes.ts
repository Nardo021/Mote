import {
  isCommandSource,
  type CommandSource,
} from "../commands/commandTypes.js";

export const CommandEventStatus = {
  accepted: "accepted",
  sent: "sent",
  completed: "completed",
  failed: "failed",
  timeout: "timeout",
  expired: "expired",
  invalid: "invalid",
  unsupported: "unsupported",
  permission_required: "permission_required",
} as const;

export type CommandEventStatus =
  (typeof CommandEventStatus)[keyof typeof CommandEventStatus];

export function isCommandEventStatus(
  value: string,
): value is CommandEventStatus {
  switch (value) {
    case CommandEventStatus.accepted:
    case CommandEventStatus.sent:
    case CommandEventStatus.completed:
    case CommandEventStatus.failed:
    case CommandEventStatus.timeout:
    case CommandEventStatus.expired:
    case CommandEventStatus.invalid:
    case CommandEventStatus.unsupported:
    case CommandEventStatus.permission_required:
      return true;
    default: {
      const _exhaustive: never = value as never;
      void _exhaustive;
      return false;
    }
  }
}

export type CommandEventRecord = {
  id: string;
  commandId: string;
  deviceId: string;
  action: string;
  source: CommandSource;
  status: CommandEventStatus;
  createdAt: number;
  sentAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
  errorCode: string | null;
};

export type CommandEventRow = {
  id: string;
  command_id: string;
  device_id: string;
  action: string;
  source: string;
  status: string;
  created_at: number;
  sent_at: number | null;
  completed_at: number | null;
  duration_ms: number | null;
  error_code: string | null;
};

export type ActivityQuery = {
  limit: number;
  offset: number;
  deviceId?: string;
  status?: CommandEventStatus;
  source?: CommandSource;
  action?: string;
};

export type LastCommandSummary = {
  command_id: string;
  action: string;
  status: CommandEventStatus;
  source: CommandSource;
  created_at: number;
  duration_ms: number | null;
};

export function mapCommandEventRow(row: CommandEventRow): CommandEventRecord {
  if (!isCommandEventStatus(row.status)) {
    throw new Error(`Invalid stored command event status: ${row.status}`);
  }
  if (!isCommandSource(row.source)) {
    throw new Error(`Invalid stored command event source: ${row.source}`);
  }
  return {
    id: row.id,
    commandId: row.command_id,
    deviceId: row.device_id,
    action: row.action,
    source: row.source,
    status: row.status,
    createdAt: row.created_at,
    sentAt: row.sent_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
    errorCode: row.error_code,
  };
}

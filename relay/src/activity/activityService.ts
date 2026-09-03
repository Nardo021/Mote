import {
  ACTIVITY_DEFAULT_LIMIT,
  ACTIVITY_MAX_LIMIT,
  ACTIVITY_OVERVIEW_LIMIT,
  ACTIVITY_RETENTION_LIMIT,
} from "../config/constants.js";
import type { CommandSource } from "../commands/commandTypes.js";
import { invalidRequest } from "../utils/errors.js";
import { createId } from "../utils/ids.js";
import { nowMs } from "../utils/time.js";
import type { ActivityRepository } from "./activityRepository.js";
import {
  CommandEventStatus,
  type ActivityQuery,
  type CommandEventRecord,
  type CommandEventStatus as CommandEventStatusType,
  type LastCommandSummary,
} from "./activityTypes.js";

export type RecordAcceptedInput = {
  commandId: string;
  deviceId: string;
  action: string;
  source: CommandSource;
  createdAt: number;
};

export class ActivityService {
  constructor(private readonly events: ActivityRepository) {}

  recordAccepted(input: RecordAcceptedInput): void {
    this.events.insert({
      id: createId(),
      commandId: input.commandId,
      deviceId: input.deviceId,
      action: input.action,
      source: input.source,
      status: CommandEventStatus.accepted,
      createdAt: input.createdAt,
      sentAt: null,
      completedAt: null,
      durationMs: null,
      errorCode: null,
    });
    this.events.prune(ACTIVITY_RETENTION_LIMIT);
  }

  recordSent(commandId: string, sentAt: number = nowMs()): void {
    this.events.updateByCommandId(commandId, {
      status: CommandEventStatus.sent,
      sentAt,
    });
  }

  recordTerminal(
    commandId: string,
    status: CommandEventStatusType,
    createdAt: number,
    completedAt: number = nowMs(),
    errorCode?: string,
  ): void {
    this.events.updateByCommandId(commandId, {
      status,
      completedAt,
      durationMs: Math.max(0, completedAt - createdAt),
      errorCode: errorCode ?? null,
    });
  }

  list(query: Partial<ActivityQuery> = {}): CommandEventRecord[] {
    return this.events.list(normalizeActivityQuery(query));
  }

  latestForDevice(deviceId: string): LastCommandSummary | undefined {
    return this.events.latestForDevice(deviceId);
  }

  recent(limit: number = ACTIVITY_OVERVIEW_LIMIT): CommandEventRecord[] {
    return this.events.list({
      limit,
      offset: 0,
    });
  }

  countsSince(since: number): { completed: number; failed: number } {
    return {
      completed: this.events.countSince(since, CommandEventStatus.completed),
      failed: this.events.countSince(since, CommandEventStatus.failed),
    };
  }
}

export function normalizeActivityQuery(
  query: Partial<ActivityQuery>,
): ActivityQuery {
  const limit = query.limit ?? ACTIVITY_DEFAULT_LIMIT;
  if (!Number.isFinite(limit) || limit <= 0) {
    throw invalidRequest("limit must be a positive integer.");
  }
  const offset = query.offset ?? 0;
  if (!Number.isFinite(offset) || offset < 0) {
    throw invalidRequest("offset must be a non-negative integer.");
  }
  const normalized: ActivityQuery = {
    limit: Math.min(Math.floor(limit), ACTIVITY_MAX_LIMIT),
    offset: Math.floor(offset),
  };
  if (query.deviceId !== undefined) {
    normalized.deviceId = query.deviceId;
  }
  if (query.status !== undefined) {
    normalized.status = query.status;
  }
  if (query.source !== undefined) {
    normalized.source = query.source;
  }
  if (query.action !== undefined) {
    normalized.action = query.action;
  }
  return normalized;
}

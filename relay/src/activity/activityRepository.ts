import { ACTIVITY_RETENTION_LIMIT } from "../config/constants.js";
import type { MoteDatabase } from "../storage/database.js";
import {
  mapCommandEventRow,
  type ActivityQuery,
  type CommandEventRecord,
  type CommandEventRow,
  type LastCommandSummary,
} from "./activityTypes.js";

export class ActivityRepository {
  constructor(private readonly db: MoteDatabase) {}

  insert(record: CommandEventRecord): void {
    this.db
      .prepare(
        `INSERT INTO command_events (
           id, command_id, device_id, action, source, status, created_at, sent_at, completed_at, duration_ms, error_code
         ) VALUES (
           @id, @command_id, @device_id, @action, @source, @status, @created_at, @sent_at, @completed_at, @duration_ms, @error_code
         )`,
      )
      .run({
        id: record.id,
        command_id: record.commandId,
        device_id: record.deviceId,
        action: record.action,
        source: record.source,
        status: record.status,
        created_at: record.createdAt,
        sent_at: record.sentAt,
        completed_at: record.completedAt,
        duration_ms: record.durationMs,
        error_code: record.errorCode,
      });
  }

  updateByCommandId(
    commandId: string,
    fields: {
      status: CommandEventRecord["status"];
      sentAt?: number | null;
      completedAt?: number | null;
      durationMs?: number | null;
      errorCode?: string | null;
    },
  ): boolean {
    const result = this.db
      .prepare(
        `UPDATE command_events
         SET status = @status,
             sent_at = COALESCE(@sent_at, sent_at),
             completed_at = COALESCE(@completed_at, completed_at),
             duration_ms = COALESCE(@duration_ms, duration_ms),
             error_code = COALESCE(@error_code, error_code)
         WHERE command_id = @command_id`,
      )
      .run({
        command_id: commandId,
        status: fields.status,
        sent_at: fields.sentAt ?? null,
        completed_at: fields.completedAt ?? null,
        duration_ms: fields.durationMs ?? null,
        error_code: fields.errorCode ?? null,
      });
    return result.changes > 0;
  }

  list(query: ActivityQuery): CommandEventRecord[] {
    const conditions: string[] = [];
    const params: Record<string, string | number> = {
      limit: query.limit,
      offset: query.offset,
    };
    if (query.deviceId !== undefined) {
      conditions.push("device_id = @device_id");
      params.device_id = query.deviceId;
    }
    if (query.status !== undefined) {
      conditions.push("status = @status");
      params.status = query.status;
    }
    if (query.source !== undefined) {
      conditions.push("source = @source");
      params.source = query.source;
    }
    if (query.action !== undefined) {
      conditions.push("action = @action");
      params.action = query.action;
    }
    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.db
      .prepare(
        `SELECT id, command_id, device_id, action, source, status, created_at, sent_at, completed_at, duration_ms, error_code
         FROM command_events
         ${where}
         ORDER BY created_at DESC
         LIMIT @limit OFFSET @offset`,
      )
      .all(params) as CommandEventRow[];
    return rows.map(mapCommandEventRow);
  }

  latestForDevice(deviceId: string): LastCommandSummary | undefined {
    const row = this.db
      .prepare(
        `SELECT command_id, action, status, source, created_at, duration_ms, error_code
         FROM command_events
         WHERE device_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(deviceId) as
      | {
          command_id: string;
          action: string;
          status: LastCommandSummary["status"];
          source: LastCommandSummary["source"];
          created_at: number;
          duration_ms: number | null;
          error_code: string | null;
        }
      | undefined;
    if (!row) {
      return undefined;
    }
    return {
      command_id: row.command_id,
      action: row.action,
      status: row.status,
      source: row.source,
      created_at: row.created_at,
      duration_ms: row.duration_ms,
      error_code: row.error_code,
    };
  }

  countSince(since: number, status?: CommandEventRecord["status"]): number {
    if (status === undefined) {
      const row = this.db
        .prepare(
          "SELECT COUNT(*) AS count FROM command_events WHERE created_at >= ?",
        )
        .get(since) as { count: number };
      return row.count;
    }
    const row = this.db
      .prepare(
        "SELECT COUNT(*) AS count FROM command_events WHERE created_at >= ? AND status = ?",
      )
      .get(since, status) as { count: number };
    return row.count;
  }

  prune(limit: number = ACTIVITY_RETENTION_LIMIT): number {
    const result = this.db
      .prepare(
        `DELETE FROM command_events
         WHERE id NOT IN (
           SELECT id FROM command_events ORDER BY created_at DESC LIMIT ?
         )`,
      )
      .run(limit);
    return result.changes;
  }
}

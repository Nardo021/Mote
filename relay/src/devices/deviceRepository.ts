import type { MoteDatabase } from "../storage/database.js";
import { nowMs } from "../utils/time.js";
import { mapDeviceRow, type DeviceRecord, type DeviceRow } from "./deviceTypes.js";

export class DeviceRepository {
  constructor(private readonly db: MoteDatabase) {}

  insert(record: DeviceRecord): void {
    this.db
      .prepare(
        `INSERT INTO devices (id, name, credential_hash, enabled, created_at, updated_at, last_seen_at, app_version)
         VALUES (@id, @name, @credential_hash, @enabled, @created_at, @updated_at, @last_seen_at, @app_version)`,
      )
      .run({
        id: record.id,
        name: record.name,
        credential_hash: record.credentialHash,
        enabled: record.enabled ? 1 : 0,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
        last_seen_at: record.lastSeenAt,
        app_version: record.appVersion,
      });
  }

  findById(id: string): DeviceRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT id, name, credential_hash, enabled, created_at, updated_at, last_seen_at, app_version
         FROM devices WHERE id = ?`,
      )
      .get(id) as DeviceRow | undefined;
    return row ? mapDeviceRow(row) : undefined;
  }

  list(): DeviceRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, credential_hash, enabled, created_at, updated_at, last_seen_at, app_version
         FROM devices ORDER BY created_at ASC`,
      )
      .all() as DeviceRow[];
    return rows.map(mapDeviceRow);
  }

  setEnabled(id: string, enabled: boolean): boolean {
    const result = this.db
      .prepare("UPDATE devices SET enabled = ?, updated_at = ? WHERE id = ?")
      .run(enabled ? 1 : 0, nowMs(), id);
    return result.changes > 0;
  }

  updateCredentialHash(id: string, credentialHash: string): boolean {
    const result = this.db
      .prepare("UPDATE devices SET credential_hash = ?, updated_at = ? WHERE id = ?")
      .run(credentialHash, nowMs(), id);
    return result.changes > 0;
  }

  updateLastSeen(id: string, lastSeenAt: number): boolean {
    const result = this.db
      .prepare("UPDATE devices SET last_seen_at = ?, updated_at = ? WHERE id = ?")
      .run(lastSeenAt, lastSeenAt, id);
    return result.changes > 0;
  }

  updateAppVersion(id: string, appVersion: string): boolean {
    const result = this.db
      .prepare("UPDATE devices SET app_version = ?, updated_at = ? WHERE id = ?")
      .run(appVersion, nowMs(), id);
    return result.changes > 0;
  }
}

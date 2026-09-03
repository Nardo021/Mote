import type { MoteDatabase } from "../storage/database.js";
import {
  mapPairRequestRow,
  PairRequestStatus,
  type PairRequestRecord,
  type PairRequestRow,
  type PairRequestStatus as PairStatus,
} from "./pairTypes.js";

export class PairRequestRepository {
  constructor(private readonly db: MoteDatabase) {}

  insert(record: PairRequestRecord): void {
    this.db
      .prepare(
        `INSERT INTO pair_requests (
           id, device_id, device_name, pair_secret_hash, status, expires_at, created_at
         ) VALUES (
           @id, @device_id, @device_name, @pair_secret_hash, @status, @expires_at, @created_at
         )`,
      )
      .run({
        id: record.id,
        device_id: record.deviceId,
        device_name: record.deviceName,
        pair_secret_hash: record.pairSecretHash,
        status: record.status,
        expires_at: record.expiresAt,
        created_at: record.createdAt,
      });
  }

  findById(id: string): PairRequestRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT id, device_id, device_name, pair_secret_hash, status, expires_at, created_at
         FROM pair_requests WHERE id = ?`,
      )
      .get(id) as PairRequestRow | undefined;
    return row ? mapPairRequestRow(row) : undefined;
  }

  findPendingByDeviceId(deviceId: string): PairRequestRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT id, device_id, device_name, pair_secret_hash, status, expires_at, created_at
         FROM pair_requests
         WHERE device_id = ? AND status = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(deviceId, PairRequestStatus.pending) as PairRequestRow | undefined;
    return row ? mapPairRequestRow(row) : undefined;
  }

  listPending(): PairRequestRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, device_id, device_name, pair_secret_hash, status, expires_at, created_at
         FROM pair_requests
         WHERE status = ?
         ORDER BY created_at ASC`,
      )
      .all(PairRequestStatus.pending) as PairRequestRow[];
    return rows.map(mapPairRequestRow);
  }

  updateStatus(id: string, status: PairStatus): boolean {
    const result = this.db
      .prepare("UPDATE pair_requests SET status = ? WHERE id = ?")
      .run(status, id);
    return result.changes > 0;
  }

  expirePending(now: number): PairRequestRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, device_id, device_name, pair_secret_hash, status, expires_at, created_at
         FROM pair_requests
         WHERE status = ? AND expires_at <= ?`,
      )
      .all(PairRequestStatus.pending, now) as PairRequestRow[];
    const expired = rows.map(mapPairRequestRow);
    if (expired.length === 0) {
      return [];
    }
    this.db
      .prepare(
        `UPDATE pair_requests SET status = ?
         WHERE status = ? AND expires_at <= ?`,
      )
      .run(PairRequestStatus.expired, PairRequestStatus.pending, now);
    return expired;
  }
}

export const PairRequestStatus = {
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
  cancelled: "cancelled",
  expired: "expired",
} as const;

export type PairRequestStatus =
  (typeof PairRequestStatus)[keyof typeof PairRequestStatus];

export type PairRequestRecord = {
  id: string;
  deviceId: string;
  deviceName: string;
  pairSecretHash: string;
  status: PairRequestStatus;
  expiresAt: number;
  createdAt: number;
};

export type PairRequestRow = {
  id: string;
  device_id: string;
  device_name: string;
  pair_secret_hash: string;
  status: PairRequestStatus;
  expires_at: number;
  created_at: number;
};

export type CreatedPairRequest = {
  id: string;
  pairSecret: string;
  expiresAt: number;
};

export type AdminPairRequest = {
  id: string;
  device_id: string;
  device_name: string;
  created_at: number;
  expires_at: number;
};

export type PairApprovedMessage = {
  type: "pair_approved";
  version: 1;
  device_id: string;
  credential: string;
  name: string;
};

export type PairRejectedMessage = {
  type: "pair_rejected";
  version: 1;
  error: string;
};

export type PairExpiredMessage = {
  type: "pair_expired";
  version: 1;
};

export type PairPendingMessage = {
  type: "pair_pending";
  version: 1;
};

export type PairOutgoingMessage =
  | PairApprovedMessage
  | PairRejectedMessage
  | PairExpiredMessage
  | PairPendingMessage;

export function mapPairRequestRow(row: PairRequestRow): PairRequestRecord {
  return {
    id: row.id,
    deviceId: row.device_id,
    deviceName: row.device_name,
    pairSecretHash: row.pair_secret_hash,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export function presentAdminPairRequest(
  record: PairRequestRecord,
): AdminPairRequest {
  return {
    id: record.id,
    device_id: record.deviceId,
    device_name: record.deviceName,
    created_at: record.createdAt,
    expires_at: record.expiresAt,
  };
}

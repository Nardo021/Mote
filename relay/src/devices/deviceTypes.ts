export type DeviceRecord = {
  id: string;
  name: string;
  credentialHash: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastSeenAt: number | null;
};

export type DeviceRow = {
  id: string;
  name: string;
  credential_hash: string;
  enabled: number;
  created_at: number;
  updated_at: number;
  last_seen_at: number | null;
};

export type CreatedDevice = {
  id: string;
  name: string;
  credential: string;
  createdAt: number;
};

export type DeviceStatus = {
  device_id: string;
  name: string;
  online: boolean;
  last_seen_at: number | null;
};

export function mapDeviceRow(row: DeviceRow): DeviceRecord {
  return {
    id: row.id,
    name: row.name,
    credentialHash: row.credential_hash,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at,
  };
}

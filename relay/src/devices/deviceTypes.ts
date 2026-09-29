import type { DevicePlatform } from "../protocol/actions.js";

export type DeviceRecord = {
  id: string;
  name: string;
  credentialHash: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastSeenAt: number | null;
  appVersion: string | null;
  platform: DevicePlatform | null;
  actions: string[] | null;
};

export type DeviceRow = {
  id: string;
  name: string;
  credential_hash: string;
  enabled: number;
  created_at: number;
  updated_at: number;
  last_seen_at: number | null;
  app_version: string | null;
  platform: string | null;
  actions: string | null;
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
  platform: DevicePlatform | null;
  actions: string[];
};

function parseStoredActions(value: string | null): string[] | null {
  if (value === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function parseStoredPlatform(value: string | null): DevicePlatform | null {
  if (value === "macos" || value === "windows") {
    return value;
  }
  return null;
}

export function mapDeviceRow(row: DeviceRow): DeviceRecord {
  return {
    id: row.id,
    name: row.name,
    credentialHash: row.credential_hash,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at,
    appVersion: row.app_version,
    platform: parseStoredPlatform(row.platform),
    actions: parseStoredActions(row.actions),
  };
}

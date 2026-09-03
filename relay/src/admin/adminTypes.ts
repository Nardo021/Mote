export type AdminRecord = {
  id: string;
  username: string;
  passwordHash: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastLoginAt: number | null;
};

export type AdminRow = {
  id: string;
  username: string;
  password_hash: string;
  enabled: number;
  created_at: number;
  updated_at: number;
  last_login_at: number | null;
};

export type AdminPublic = {
  id: string;
  username: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastLoginAt: number | null;
};

export type AdminSessionRecord = {
  id: string;
  adminId: string;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  lastSeenAt: number;
};

export type AdminSessionRow = {
  id: string;
  admin_id: string;
  token_hash: string;
  created_at: number;
  expires_at: number;
  last_seen_at: number;
};

export type AuthenticatedAdmin = {
  sessionId: string;
  adminId: string;
  username: string;
};

export function mapAdminRow(row: AdminRow): AdminRecord {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  };
}

export function toAdminPublic(record: AdminRecord): AdminPublic {
  return {
    id: record.id,
    username: record.username,
    enabled: record.enabled,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastLoginAt: record.lastLoginAt,
  };
}

export function mapAdminSessionRow(row: AdminSessionRow): AdminSessionRecord {
  return {
    id: row.id,
    adminId: row.admin_id,
    tokenHash: row.token_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at,
  };
}

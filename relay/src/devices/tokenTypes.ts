import type { Permission } from "../auth/permissions.js";

export type ApiTokenRecord = {
  id: string;
  name: string;
  tokenHash: string;
  permission: Permission;
  enabled: boolean;
  createdAt: number;
  lastUsedAt: number | null;
};

export type ApiTokenRow = {
  id: string;
  name: string;
  token_hash: string;
  permission: string;
  enabled: number;
  created_at: number;
  last_used_at: number | null;
};

export type CreatedApiToken = {
  id: string;
  name: string;
  token: string;
  permission: Permission;
  createdAt: number;
};

import type { Permission } from "../auth/permissions.js";

export const CommandClientKind = {
  shortcut: "shortcut",
} as const;

export type CommandClientKind =
  (typeof CommandClientKind)[keyof typeof CommandClientKind];

export function isCommandClientKind(value: string): value is CommandClientKind {
  switch (value) {
    case CommandClientKind.shortcut:
      return true;
    default: {
      const _exhaustive: never = value as never;
      void _exhaustive;
      return false;
    }
  }
}

export type ApiTokenRecord = {
  id: string;
  name: string;
  tokenHash: string;
  permission: Permission;
  clientKind: CommandClientKind;
  deviceId: string | null;
  enabled: boolean;
  createdAt: number;
  lastUsedAt: number | null;
};

export type ApiTokenRow = {
  id: string;
  name: string;
  token_hash: string;
  permission: string;
  client_kind: string;
  device_id: string | null;
  enabled: number;
  created_at: number;
  last_used_at: number | null;
};

export type CreatedApiToken = {
  id: string;
  name: string;
  token: string;
  permission: Permission;
  clientKind: CommandClientKind;
  deviceId: string;
  createdAt: number;
};

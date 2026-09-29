export type CommandClientKind = "shortcut";

export type AdminToken = {
  id: string;
  name: string;
  permission: string;
  client_kind: CommandClientKind;
  device_id: string | null;
  enabled: boolean;
  created_at: number;
  last_used_at: number | null;
};

export type CreatedToken = AdminToken & {
  token: string;
};

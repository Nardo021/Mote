export type AdminToken = {
  id: string;
  name: string;
  permission: string;
  enabled: boolean;
  created_at: number;
  last_used_at: number | null;
};

export type CreatedToken = AdminToken & {
  token: string;
};

export type LastCommand = {
  command_id: string;
  action: string;
  status: string;
  source: string;
  created_at: number;
  duration_ms: number | null;
};

export type AdminDevice = {
  id: string;
  name: string;
  enabled: boolean;
  online: boolean;
  connected_at: number | null;
  last_seen_at: number | null;
  last_heartbeat_at: number | null;
  app_version: string | null;
  created_at: number;
  updated_at: number;
  last_command: LastCommand | null;
};

export type CommandResult = {
  status: string;
  device_id: string;
  command_id?: string;
  duration_ms: number | null;
};

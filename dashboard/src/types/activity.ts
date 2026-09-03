export type ActivityEvent = {
  id: string;
  command_id: string;
  device_id: string;
  device_name: string;
  action: string;
  source: string;
  status: string;
  created_at: number;
  sent_at: number | null;
  completed_at: number | null;
  duration_ms: number | null;
  error_code: string | null;
};

export type OverviewResponse = {
  relay: {
    status: "operational" | "unavailable";
    started_at: number;
    uptime_ms: number;
    protocol_version: number;
  };
  devices: {
    total: number;
    online: number;
    offline: number;
  };
  commands: {
    completed_24h: number;
    failed_24h: number;
  };
  recent_activity: Array<{
    id: string;
    command_id: string;
    device_id: string;
    device_name: string;
    action: string;
    source: string;
    status: string;
    created_at: number;
    duration_ms: number | null;
  }>;
};

export type SystemResponse = {
  environment: string;
  public_url: string;
  protocol_version: number;
  database: string;
  uptime_ms: number;
  command_ttl_ms: number;
  heartbeat_stale_ms: number;
};

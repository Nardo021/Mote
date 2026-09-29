export const SocketClose = {
  invalidCredentials: { code: 1008, reason: "invalid_credentials" },
  unsupportedVersion: { code: 1008, reason: "unsupported_version" },
  authTimeout: { code: 1008, reason: "auth_timeout" },
  heartbeatStale: { code: 1001, reason: "heartbeat_stale" },
  superseded: { code: 1000, reason: "superseded" },
  expired: { code: 1000, reason: "expired" },
  credentialRotated: { code: 1000, reason: "credential_rotated" },
  deviceDisabled: { code: 1000, reason: "device_disabled" },
  serverShutdown: { code: 1001, reason: "server_shutdown" },
  socketError: { code: 1011, reason: "socket_error" },
} as const;

export type SocketClose = (typeof SocketClose)[keyof typeof SocketClose];

export type SocketCloseReason = SocketClose["reason"];

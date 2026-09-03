import type { ProtocolVersion } from "./protocolVersion.js";

export type AuthMessage = {
  type: "auth";
  version: ProtocolVersion;
  device_id: string;
  credential: string;
};

export type AuthResultOk = {
  type: "auth_result";
  version: ProtocolVersion;
  status: "ok";
};

export type AuthResultError = {
  type: "auth_result";
  version: ProtocolVersion;
  status: "error";
  error: string;
};

export type AuthResultMessage = AuthResultOk | AuthResultError;

export type HeartbeatMessage = {
  type: "heartbeat";
  version: ProtocolVersion;
  device_id: string;
  sent_at: number;
};

export type HeartbeatAckMessage = {
  type: "heartbeat_ack";
  version: ProtocolVersion;
  sent_at: number;
  server_at: number;
};

export type CommandMessage = {
  type: "command";
  version: ProtocolVersion;
  id: string;
  device_id: string;
  action: string;
  created_at: number;
  expires_at: number;
  nonce: string;
};

export const CommandResultStatus = {
  completed: "completed",
  failed: "failed",
  expired: "expired",
  invalid: "invalid",
  unsupported: "unsupported",
  permission_required: "permission_required",
} as const;

export type CommandResultStatus = (typeof CommandResultStatus)[keyof typeof CommandResultStatus];

export type CommandResultMessage = {
  type: "command_result";
  version: ProtocolVersion;
  command_id: string;
  status: CommandResultStatus;
  completed_at: number;
  error?: string;
};

export type ErrorMessage = {
  type: "error";
  version: ProtocolVersion;
  error: string;
};

export type IncomingDeviceMessage = AuthMessage | HeartbeatMessage | CommandResultMessage;

export type OutgoingDeviceMessage = AuthResultMessage | HeartbeatAckMessage | CommandMessage | ErrorMessage;

export function isCommandResultStatus(value: string): value is CommandResultStatus {
  switch (value) {
    case CommandResultStatus.completed:
    case CommandResultStatus.failed:
    case CommandResultStatus.expired:
    case CommandResultStatus.invalid:
    case CommandResultStatus.unsupported:
    case CommandResultStatus.permission_required:
      return true;
    default: {
      const _exhaustive: never = value as never;
      void _exhaustive;
      return false;
    }
  }
}

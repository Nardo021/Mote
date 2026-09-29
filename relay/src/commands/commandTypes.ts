export { ImplementedAction, isImplementedAction } from "../protocol/actions.js";

export const CommandSource = {
  shortcut: "shortcut",
  dashboard: "dashboard",
} as const;

export type CommandSource = (typeof CommandSource)[keyof typeof CommandSource];

export function isCommandSource(value: string): value is CommandSource {
  switch (value) {
    case CommandSource.shortcut:
    case CommandSource.dashboard:
      return true;
    default: {
      const _exhaustive: never = value as never;
      void _exhaustive;
      return false;
    }
  }
}

export type ShortcutCommandBody = {
  action: string;
};

export type CommandHttpStatus =
  | "completed"
  | "failed"
  | "expired"
  | "invalid"
  | "unsupported"
  | "permission_required"
  | "timeout"
  | "offline";

export type CommandHttpResponse = {
  status: CommandHttpStatus;
  device_id: string;
  device: string;
  command_id?: string;
};

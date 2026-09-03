export const ImplementedAction = {
  lock: "lock",
} as const;

export type ImplementedAction =
  (typeof ImplementedAction)[keyof typeof ImplementedAction];

export const ReservedAction = {
  sleep: "sleep",
  mute: "mute",
  unmute: "unmute",
  play_pause: "play_pause",
} as const;

export type ReservedAction =
  (typeof ReservedAction)[keyof typeof ReservedAction];

export type KnownAction = ImplementedAction | ReservedAction;

export function isImplementedAction(value: string): value is ImplementedAction {
  return value === ImplementedAction.lock;
}

export function isReservedAction(value: string): value is ReservedAction {
  switch (value) {
    case ReservedAction.sleep:
    case ReservedAction.mute:
    case ReservedAction.unmute:
    case ReservedAction.play_pause:
      return true;
    default: {
      const _exhaustive: never = value as never;
      void _exhaustive;
      return false;
    }
  }
}

export function isKnownAction(value: string): value is KnownAction {
  return isImplementedAction(value) || isReservedAction(value);
}

export const CommandSource = {
  shortcut: "shortcut",
  dashboard: "dashboard",
  ios: "ios",
} as const;

export type CommandSource = (typeof CommandSource)[keyof typeof CommandSource];

export function isCommandSource(value: string): value is CommandSource {
  switch (value) {
    case CommandSource.shortcut:
    case CommandSource.dashboard:
    case CommandSource.ios:
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

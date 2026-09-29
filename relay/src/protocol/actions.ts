export const DevicePlatform = {
  macos: "macos",
  windows: "windows",
} as const;

export type DevicePlatform = (typeof DevicePlatform)[keyof typeof DevicePlatform];

export const ImplementedAction = {
  lock: "lock",
} as const;

export type ImplementedAction =
  (typeof ImplementedAction)[keyof typeof ImplementedAction];

export const ACTIVE_ACTIONS: readonly ImplementedAction[] = [ImplementedAction.lock];

export const DEFAULT_DEVICE_ACTIONS: readonly ImplementedAction[] = ACTIVE_ACTIONS;

export function isDevicePlatform(value: string): value is DevicePlatform {
  switch (value) {
    case DevicePlatform.macos:
    case DevicePlatform.windows:
      return true;
    default: {
      const _exhaustive: never = value as never;
      void _exhaustive;
      return false;
    }
  }
}

export function isImplementedAction(value: string): value is ImplementedAction {
  return (ACTIVE_ACTIONS as readonly string[]).includes(value);
}

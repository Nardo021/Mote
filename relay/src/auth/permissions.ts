export const Permission = {
  send_command: "send_command",
  device_connection: "device_connection",
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export function isPermission(value: string): value is Permission {
  switch (value) {
    case Permission.send_command:
    case Permission.device_connection:
      return true;
    default: {
      const _exhaustive: never = value as never;
      void _exhaustive;
      return false;
    }
  }
}

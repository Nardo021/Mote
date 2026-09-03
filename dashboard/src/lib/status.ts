export type DevicePresence = "online" | "offline" | "disabled";

export function devicePresence(device: {
  enabled: boolean;
  online: boolean;
}): DevicePresence {
  if (!device.enabled) {
    return "disabled";
  }
  return device.online ? "online" : "offline";
}

export function devicePresenceLabel(presence: DevicePresence): string {
  switch (presence) {
    case "online":
      return "Online";
    case "offline":
      return "Offline";
    case "disabled":
      return "Disabled";
    default: {
      const _exhaustive: never = presence;
      return _exhaustive;
    }
  }
}

export function activityTone(
  status: string,
): "online" | "offline" | "error" | "neutral" {
  switch (status) {
    case "completed":
      return "online";
    case "failed":
    case "timeout":
    case "expired":
    case "invalid":
      return "error";
    default:
      return "neutral";
  }
}

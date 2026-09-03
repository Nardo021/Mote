const ACTION_LABELS: Record<string, string> = {
  lock: "Lock",
};

const STATUS_LABELS: Record<string, string> = {
  accepted: "Accepted",
  sent: "Sent",
  completed: "Completed",
  failed: "Failed",
  timeout: "Timeout",
  expired: "Expired",
  invalid: "Invalid",
  unsupported: "Unsupported",
  permission_required: "Permission required",
};

const SOURCE_LABELS: Record<string, string> = {
  shortcut: "Shortcut",
  dashboard: "Dashboard",
  ios: "iOS",
};

export function titleCaseAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function titleCaseStatus(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function titleCaseSource(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

export function formatDuration(durationMs: number | null | undefined): string {
  if (durationMs === null || durationMs === undefined) {
    return "—";
  }
  return `${durationMs} ms`;
}

export type RelativeTimeCopy = {
  justNow: string;
  secondsAgo: (count: number) => string;
  minuteAgo: string;
  minutesAgo: (count: number) => string;
  hourAgo: string;
  hoursAgo: (count: number) => string;
};

const DEFAULT_RELATIVE: RelativeTimeCopy = {
  justNow: "Just now",
  secondsAgo: (count) => `${count} sec ago`,
  minuteAgo: "1 minute ago",
  minutesAgo: (count) => `${count} minutes ago`,
  hourAgo: "1 hour ago",
  hoursAgo: (count) => `${count} hours ago`,
};

export function formatAbsoluteTime(
  timestamp: number | null | undefined,
  locale?: string,
): string {
  if (timestamp === null || timestamp === undefined) {
    return "—";
  }
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

export function formatDate(
  timestamp: number | null | undefined,
  locale?: string,
): string {
  if (timestamp === null || timestamp === undefined) {
    return "—";
  }
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

export function formatRelativeTime(
  timestamp: number | null | undefined,
  now: number = Date.now(),
  locale?: string,
  copy: RelativeTimeCopy = DEFAULT_RELATIVE,
): string {
  if (timestamp === null || timestamp === undefined) {
    return "—";
  }
  const delta = Math.max(0, now - timestamp);
  if (delta < 2_000) {
    return copy.justNow;
  }
  if (delta < 60_000) {
    return copy.secondsAgo(Math.floor(delta / 1000));
  }
  if (delta < 3_600_000) {
    const minutes = Math.floor(delta / 60_000);
    return minutes === 1 ? copy.minuteAgo : copy.minutesAgo(minutes);
  }
  if (delta < 86_400_000) {
    const hours = Math.floor(delta / 3_600_000);
    return hours === 1 ? copy.hourAgo : copy.hoursAgo(hours);
  }
  return formatDate(timestamp, locale);
}

export function formatUptime(uptimeMs: number): string {
  const seconds = Math.floor(uptimeMs / 1000);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function shortenId(id: string): string {
  if (id.length <= 10) {
    return id;
  }
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

export function joinPublicPath(publicUrl: string, path: string): string {
  const base = publicUrl.replace(/\/$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

export function shortcutSetupUrl(publicUrl: string, deviceId: string): string {
  return joinPublicPath(publicUrl, `/s/${deviceId}`);
}

export function commandUrl(publicUrl: string, deviceId: string): string {
  return joinPublicPath(publicUrl, `/v1/devices/${deviceId}/commands`);
}

export function lastCommandLabel(
  command: { action: string; status: string } | null,
): string {
  if (command === null) {
    return "—";
  }
  return `${titleCaseAction(command.action)} · ${titleCaseStatus(command.status)}`;
}

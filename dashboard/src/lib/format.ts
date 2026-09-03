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

export function formatAbsoluteTime(
  timestamp: number | null | undefined,
): string {
  if (timestamp === null || timestamp === undefined) {
    return "—";
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

export function formatDate(timestamp: number | null | undefined): string {
  if (timestamp === null || timestamp === undefined) {
    return "—";
  }
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

export function formatRelativeTime(
  timestamp: number | null | undefined,
  now: number = Date.now(),
): string {
  if (timestamp === null || timestamp === undefined) {
    return "—";
  }
  const delta = Math.max(0, now - timestamp);
  if (delta < 2_000) {
    return "Just now";
  }
  if (delta < 60_000) {
    return `${Math.floor(delta / 1000)} sec ago`;
  }
  if (delta < 3_600_000) {
    const minutes = Math.floor(delta / 60_000);
    return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  }
  if (delta < 86_400_000) {
    const hours = Math.floor(delta / 3_600_000);
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }
  return formatDate(timestamp);
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

export function lastCommandLabel(
  command: { action: string; status: string } | null,
): string {
  if (command === null) {
    return "—";
  }
  return `${titleCaseAction(command.action)} · ${titleCaseStatus(command.status)}`;
}

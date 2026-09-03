export const ADMIN_EVENT_TOPICS = [
  "devices",
  "pairing",
  "activity",
  "tokens",
] as const;

export type AdminEventTopic = (typeof ADMIN_EVENT_TOPICS)[number];

export const ADMIN_SSE_FALLBACK_POLL_MS = 30_000;

export function isAdminEventTopic(value: unknown): value is AdminEventTopic {
  switch (value) {
    case "devices":
    case "pairing":
    case "activity":
    case "tokens":
      return true;
    default:
      return false;
  }
}

export function parseAdminEventPayload(
  data: string,
): AdminEventTopic[] | null {
  try {
    const parsed: unknown = JSON.parse(data);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("topics" in parsed) ||
      !Array.isArray(parsed.topics)
    ) {
      return null;
    }
    const topics = parsed.topics.filter(isAdminEventTopic);
    return topics.length > 0 ? topics : null;
  } catch {
    return null;
  }
}

export function livePollInterval(live: boolean, offlineMs: number): number {
  return live ? ADMIN_SSE_FALLBACK_POLL_MS : offlineMs;
}

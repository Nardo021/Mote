export const ADMIN_EVENT_TOPICS = [
  "devices",
  "pairing",
  "activity",
  "tokens",
] as const;

export type AdminEventTopic = (typeof ADMIN_EVENT_TOPICS)[number];

export type AdminEventPayload = {
  topics: AdminEventTopic[];
};

export type AdminEventListener = (event: AdminEventPayload) => void;

const DEFAULT_COALESCE_MS = 75;

export class AdminEventBus {
  private readonly listeners = new Set<AdminEventListener>();
  private readonly pending = new Set<AdminEventTopic>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly coalesceMs: number;

  constructor(coalesceMs = DEFAULT_COALESCE_MS) {
    this.coalesceMs = coalesceMs;
  }

  subscribe(listener: AdminEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(topic: AdminEventTopic): void {
    this.pending.add(topic);
    if (this.timer !== undefined) {
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.flush();
    }, this.coalesceMs);
  }

  get subscriberCount(): number {
    return this.listeners.size;
  }

  private flush(): void {
    if (this.pending.size === 0) {
      return;
    }
    const topics = ADMIN_EVENT_TOPICS.filter((topic) => this.pending.has(topic));
    this.pending.clear();
    const event: AdminEventPayload = { topics };
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

export class LastSeenTracker {
  private readonly lastPersisted = new Map<string, number>();

  constructor(private readonly persistIntervalMs: number) {}

  shouldPersist(deviceId: string, at: number): boolean {
    const previous = this.lastPersisted.get(deviceId) ?? 0;
    return at - previous >= this.persistIntervalMs;
  }

  markPersisted(deviceId: string, at: number): void {
    this.lastPersisted.set(deviceId, at);
  }

  clear(deviceId: string): void {
    this.lastPersisted.delete(deviceId);
  }
}

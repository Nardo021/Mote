import type { CommandResultMessage, CommandResultStatus } from "../protocol/messages.js";

export type PendingOutcome = {
  status: CommandResultStatus | "timeout";
  commandId: string;
  completedAt?: number;
  error?: string;
  receivedAt: number;
  sentToDeviceAt: number;
  deviceResultAt?: number;
};

type PendingEntry = {
  resolve: (outcome: PendingOutcome) => void;
  timer: ReturnType<typeof setTimeout>;
  receivedAt: number;
  sentToDeviceAt: number;
};

export class PendingCommands {
  private readonly pending = new Map<string, PendingEntry>();

  get size(): number {
    return this.pending.size;
  }

  wait(commandId: string, timeoutMs: number, receivedAt: number, sentToDeviceAt: number): Promise<PendingOutcome> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(commandId);
        resolve({
          status: "timeout",
          commandId,
          receivedAt,
          sentToDeviceAt,
        });
      }, timeoutMs);
      this.pending.set(commandId, {
        resolve,
        timer,
        receivedAt,
        sentToDeviceAt,
      });
    });
  }

  resolve(result: CommandResultMessage): boolean {
    const entry = this.pending.get(result.command_id);
    if (!entry) {
      return false;
    }
    this.pending.delete(result.command_id);
    clearTimeout(entry.timer);
    const outcome: PendingOutcome = {
      status: result.status,
      commandId: result.command_id,
      completedAt: result.completed_at,
      receivedAt: entry.receivedAt,
      sentToDeviceAt: entry.sentToDeviceAt,
      deviceResultAt: Date.now(),
    };
    if (result.error !== undefined) {
      outcome.error = result.error;
    }
    entry.resolve(outcome);
    return true;
  }

  failAll(status: "timeout" = "timeout"): void {
    for (const [commandId, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.resolve({
        status,
        commandId,
        receivedAt: entry.receivedAt,
        sentToDeviceAt: entry.sentToDeviceAt,
      });
    }
    this.pending.clear();
  }
}

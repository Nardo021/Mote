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

export type CommandResultDisposition = "resolved" | "unknown" | "mismatch";

export type SecurityLogger = {
  warn: (obj: Record<string, unknown>, msg: string) => void;
};

type PendingEntry = {
  deviceId: string;
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

  wait(
    commandId: string,
    deviceId: string,
    timeoutMs: number,
    receivedAt: number,
    sentToDeviceAt: number,
  ): Promise<PendingOutcome> {
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
        deviceId,
        resolve,
        timer,
        receivedAt,
        sentToDeviceAt,
      });
    });
  }

  resolve(result: CommandResultMessage, deviceId: string): CommandResultDisposition {
    const entry = this.pending.get(result.command_id);
    if (!entry) {
      return "unknown";
    }
    if (entry.deviceId !== deviceId) {
      return "mismatch";
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
    return "resolved";
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

export function acceptCommandResult(
  pending: PendingCommands,
  result: CommandResultMessage,
  deviceId: string,
  log?: SecurityLogger,
): CommandResultDisposition {
  const disposition = pending.resolve(result, deviceId);
  if (disposition === "mismatch") {
    log?.warn(
      { device_id: deviceId, command_id: result.command_id },
      "command result rejected for device mismatch",
    );
  }
  return disposition;
}

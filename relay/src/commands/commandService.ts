import type { ActivityService } from "../activity/activityService.js";
import { CommandEventStatus } from "../activity/activityTypes.js";
import type { EnvConfig } from "../config/env.js";
import type { DeviceService } from "../devices/deviceService.js";
import type { CommandMessage } from "../protocol/messages.js";
import { PROTOCOL_VERSION } from "../protocol/protocolVersion.js";
import { AppError, ErrorCode } from "../utils/errors.js";
import { createCommandId, createNonce } from "../utils/ids.js";
import { nowMs } from "../utils/time.js";
import type { CommandRouter } from "./commandRouter.js";
import type {
  CommandHttpResponse,
  CommandHttpStatus,
  CommandSource,
} from "./commandTypes.js";
import { parseCommandBody, validateCommandAction } from "./commandValidator.js";
import type { PendingCommands, PendingOutcome } from "./pendingCommands.js";

export type CommandLogger = {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
};

function httpStatusForOutcome(
  status: PendingOutcome["status"],
): CommandHttpStatus {
  switch (status) {
    case "completed":
    case "failed":
    case "expired":
    case "invalid":
    case "unsupported":
    case "permission_required":
    case "timeout":
      return status;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function activityStatusForOutcome(status: PendingOutcome["status"]) {
  switch (status) {
    case "completed":
      return CommandEventStatus.completed;
    case "failed":
      return CommandEventStatus.failed;
    case "timeout":
      return CommandEventStatus.timeout;
    case "expired":
      return CommandEventStatus.expired;
    case "invalid":
      return CommandEventStatus.invalid;
    case "unsupported":
      return CommandEventStatus.unsupported;
    case "permission_required":
      return CommandEventStatus.permission_required;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export class CommandService {
  constructor(
    private readonly config: EnvConfig,
    private readonly devices: DeviceService,
    private readonly router: CommandRouter,
    private readonly pending: PendingCommands,
    private readonly isOnline: (deviceId: string) => boolean,
    private readonly activity: ActivityService,
    private readonly log: CommandLogger,
  ) {}

  async submit(
    deviceId: string,
    body: unknown,
    source: CommandSource = "shortcut",
  ): Promise<{
    httpStatus: number;
    payload: CommandHttpResponse;
    durationMs?: number;
  }> {
    const receivedAt = nowMs();
    const device = this.devices.requireDevice(deviceId);
    const { action } = parseCommandBody(body);
    validateCommandAction(action, {
      device_id: device.id,
      device: device.name,
    });

    if (!device.enabled) {
      throw new AppError(
        ErrorCode.DEVICE_DISABLED,
        "Device is disabled.",
        409,
        {
          status: "disabled",
          device_id: device.id,
          device: device.name,
        },
      );
    }

    if (!this.isOnline(device.id)) {
      throw new AppError(
        ErrorCode.DEVICE_OFFLINE,
        "Device is currently offline.",
        409,
        {
          status: "offline",
          device_id: device.id,
          device: device.name,
        },
      );
    }

    if (this.pending.size >= this.config.maxPendingCommands) {
      throw new AppError(
        ErrorCode.COMMAND_FAILED,
        "Too many in-flight commands.",
        503,
        {
          device_id: device.id,
          device: device.name,
        },
      );
    }

    const createdAt = nowMs();
    const command: CommandMessage = {
      type: "command",
      version: PROTOCOL_VERSION,
      id: createCommandId(),
      device_id: device.id,
      action,
      created_at: createdAt,
      expires_at: createdAt + this.config.commandTtlMs,
      nonce: createNonce(),
    };

    this.log.info(
      { device_id: device.id, command_id: command.id, action, source },
      "command accepted",
    );
    this.activity.recordAccepted({
      commandId: command.id,
      deviceId: device.id,
      action,
      source,
      createdAt,
    });

    const waiter = this.pending.wait(
      command.id,
      this.config.commandTimeoutMs,
      receivedAt,
      createdAt,
    );
    const sent = this.router.send(command);
    if (!sent) {
      this.pending.resolve({
        type: "command_result",
        version: PROTOCOL_VERSION,
        command_id: command.id,
        status: "failed",
        completed_at: nowMs(),
        error: "device_disconnected",
      });
      this.activity.recordTerminal(
        command.id,
        CommandEventStatus.failed,
        createdAt,
        nowMs(),
        "device_disconnected",
      );
      throw new AppError(
        ErrorCode.DEVICE_OFFLINE,
        "Device is currently offline.",
        409,
        {
          status: "offline",
          device_id: device.id,
          device: device.name,
          command_id: command.id,
        },
      );
    }

    this.activity.recordSent(command.id);
    this.log.info(
      { device_id: device.id, command_id: command.id },
      "command routed",
    );
    const outcome = await waiter;
    const completedAt = outcome.completedAt ?? nowMs();
    const durationMs = Math.max(0, completedAt - createdAt);
    this.activity.recordTerminal(
      command.id,
      activityStatusForOutcome(outcome.status),
      createdAt,
      completedAt,
      outcome.error,
    );
    const totalMs = nowMs() - receivedAt;
    const relayProcessingMs = outcome.sentToDeviceAt - outcome.receivedAt;
    const deviceRoundTripMs =
      outcome.deviceResultAt === undefined
        ? undefined
        : outcome.deviceResultAt - outcome.sentToDeviceAt;

    const timing = {
      device_id: device.id,
      command_id: command.id,
      status: outcome.status,
      relay_processing_ms: relayProcessingMs,
      device_round_trip_ms: deviceRoundTripMs,
      total_command_ms: totalMs,
    };

    if (outcome.status === "timeout") {
      this.log.warn(timing, "command timed out");
      return {
        httpStatus: 504,
        payload: {
          status: "timeout",
          device_id: device.id,
          device: device.name,
          command_id: command.id,
        },
        durationMs,
      };
    }

    if (outcome.status === "completed") {
      this.log.info(timing, "command completed");
    } else {
      this.log.warn(timing, "command failed");
    }

    return {
      httpStatus: 200,
      payload: {
        status: httpStatusForOutcome(outcome.status),
        device_id: device.id,
        device: device.name,
        command_id: command.id,
      },
      durationMs,
    };
  }
}

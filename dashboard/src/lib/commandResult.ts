import type { CommandResult } from "../types/device.js";
import { ApiError } from "./errors.js";

export function commandErrorCode(status: string): string {
  switch (status) {
    case "completed":
      return "COMMAND_COMPLETED";
    case "permission_required":
      return "PERMISSION_REQUIRED";
    case "timeout":
      return "COMMAND_TIMEOUT";
    case "unsupported":
      return "UNSUPPORTED_ACTION";
    case "offline":
      return "DEVICE_OFFLINE";
    default:
      return "COMMAND_FAILED";
  }
}

export function requireCompletedCommand(result: CommandResult): CommandResult {
  if (result.status !== "completed") {
    throw new ApiError(409, commandErrorCode(result.status), result.status);
  }
  return result;
}

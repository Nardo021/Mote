import { AppError, ErrorCode } from "../utils/errors.js";
import { isImplementedAction, isKnownAction } from "./commandTypes.js";

export type ValidatedAction = "lock";

export function validateCommandAction(action: unknown, extra: { device_id?: string; device?: string } = {}): ValidatedAction {
  if (typeof action !== "string" || action.trim() === "") {
    throw new AppError(ErrorCode.INVALID_REQUEST, "Action is required.", 400, extra);
  }
  if (!isKnownAction(action) || !isImplementedAction(action)) {
    throw new AppError(ErrorCode.UNSUPPORTED_ACTION, "Action is not supported.", 422, {
      ...extra,
      status: "unsupported",
    });
  }
  return action;
}

export function parseCommandBody(body: unknown): { action: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new AppError(ErrorCode.INVALID_REQUEST, "JSON object body is required.", 400);
  }
  const record = body as Record<string, unknown>;
  if (!("action" in record)) {
    throw new AppError(ErrorCode.INVALID_REQUEST, "Action is required.", 400);
  }
  if (typeof record.action !== "string") {
    throw new AppError(ErrorCode.INVALID_REQUEST, "Action must be a string.", 400);
  }
  return { action: record.action };
}

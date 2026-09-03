import type { ApiErrorBody } from "../types/api.js";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const FRIENDLY: Record<string, string> = {
  DEVICE_OFFLINE: "Device is currently offline.",
  DEVICE_DISABLED: "Device is disabled.",
  DEVICE_NOT_FOUND: "Device not found.",
  UNAUTHORIZED: "Invalid username or password.",
  ADMIN_DISABLED: "This administrator is disabled.",
  SESSION_EXPIRED: "Session expired. Sign in again.",
  RATE_LIMITED: "Too many sign-in attempts. Try again shortly.",
  UNSUPPORTED_ACTION: "That action is not supported.",
  COMMAND_TIMEOUT: "The device did not confirm the command in time.",
  COMMAND_FAILED: "The command did not complete.",
  PERMISSION_REQUIRED: "This Mac still needs Accessibility permission.",
  INVALID_REQUEST: "That request was not valid.",
};

const ERROR_KEYS: Record<string, string> = {
  DEVICE_OFFLINE: "errors.DEVICE_OFFLINE",
  DEVICE_DISABLED: "errors.DEVICE_DISABLED",
  DEVICE_NOT_FOUND: "errors.DEVICE_NOT_FOUND",
  UNAUTHORIZED: "errors.UNAUTHORIZED",
  ADMIN_DISABLED: "errors.ADMIN_DISABLED",
  SESSION_EXPIRED: "errors.SESSION_EXPIRED",
  RATE_LIMITED: "errors.RATE_LIMITED",
  UNSUPPORTED_ACTION: "errors.UNSUPPORTED_ACTION",
  COMMAND_TIMEOUT: "errors.COMMAND_TIMEOUT",
  COMMAND_FAILED: "errors.COMMAND_FAILED",
  PERMISSION_REQUIRED: "errors.PERMISSION_REQUIRED",
  INVALID_REQUEST: "errors.INVALID_REQUEST",
};

export function errorMessageKey(code: string): string {
  return ERROR_KEYS[code] ?? "errors.unknown";
}

export function friendlyError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return FRIENDLY[error.code] ?? error.message ?? fallback;
  }
  return fallback;
}

export function translateError(
  error: unknown,
  translate: (key: string) => string,
  fallbackKey: string,
): string {
  if (error instanceof ApiError) {
    const key = ERROR_KEYS[error.code];
    if (key !== undefined) {
      return translate(key);
    }
    return error.message === "" ? translate(fallbackKey) : error.message;
  }
  return translate(fallbackKey);
}

export function parseApiError(status: number, body: unknown): ApiError {
  if (typeof body === "object" && body !== null && "error" in body) {
    const envelope = body as ApiErrorBody;
    if (
      typeof envelope.error?.code === "string" &&
      typeof envelope.error.message === "string"
    ) {
      return new ApiError(status, envelope.error.code, envelope.error.message);
    }
  }
  return new ApiError(status, "INTERNAL_ERROR", "Request failed.");
}

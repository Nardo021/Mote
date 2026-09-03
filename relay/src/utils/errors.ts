export const ErrorCode = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  DEVICE_NOT_FOUND: "DEVICE_NOT_FOUND",
  DEVICE_DISABLED: "DEVICE_DISABLED",
  DEVICE_OFFLINE: "DEVICE_OFFLINE",
  UNSUPPORTED_ACTION: "UNSUPPORTED_ACTION",
  INVALID_REQUEST: "INVALID_REQUEST",
  COMMAND_TIMEOUT: "COMMAND_TIMEOUT",
  COMMAND_FAILED: "COMMAND_FAILED",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export type ErrorExtra = {
  status?: string;
  device_id?: string;
  device?: string;
  command_id?: string;
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly extra: ErrorExtra;

  constructor(code: ErrorCode, message: string, statusCode: number, extra: ErrorExtra = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.extra = extra;
  }
}

export type ErrorEnvelope = {
  status?: string;
  device_id?: string;
  device?: string;
  command_id?: string;
  error: {
    code: ErrorCode;
    message: string;
  };
};

export function toErrorEnvelope(error: AppError): ErrorEnvelope {
  const envelope: ErrorEnvelope = {
    error: {
      code: error.code,
      message: error.message,
    },
  };
  if (error.extra.status !== undefined) {
    envelope.status = error.extra.status;
  }
  if (error.extra.device_id !== undefined) {
    envelope.device_id = error.extra.device_id;
  }
  if (error.extra.device !== undefined) {
    envelope.device = error.extra.device;
  }
  if (error.extra.command_id !== undefined) {
    envelope.command_id = error.extra.command_id;
  }
  return envelope;
}

export function unauthorized(message = "Missing or invalid bearer token."): AppError {
  return new AppError(ErrorCode.UNAUTHORIZED, message, 401);
}

export function forbidden(message = "Credential does not have permission to send commands."): AppError {
  return new AppError(ErrorCode.FORBIDDEN, message, 403);
}

export function invalidRequest(message = "Invalid request."): AppError {
  return new AppError(ErrorCode.INVALID_REQUEST, message, 400);
}

export function rateLimited(message = "Too many command requests."): AppError {
  return new AppError(ErrorCode.RATE_LIMITED, message, 429, { status: "rate_limited" });
}

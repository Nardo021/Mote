import type { EnvConfig } from "../config/env.js";
import { AppError, ErrorCode } from "../utils/errors.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type HeaderLookup = {
  get(name: string): string | null;
};

export function originFromHeaders(
  headers: HeaderLookup,
  protocol: string,
): string | undefined {
  const origin = blankToUndefined(headers.get("origin"));
  if (origin !== undefined) {
    return origin;
  }
  const referer = blankToUndefined(headers.get("referer"));
  if (referer !== undefined) {
    try {
      return new URL(referer).origin;
    } catch {
      return undefined;
    }
  }
  const host = blankToUndefined(headers.get("host"));
  if (host === undefined) {
    return undefined;
  }
  return `${protocol}://${host}`;
}

export function assertMutationAllowed(
  method: string,
  headers: HeaderLookup,
  protocol: string,
  config: EnvConfig,
): void {
  const normalized = method.toUpperCase();
  if (!MUTATING_METHODS.has(normalized)) {
    return;
  }
  const origin = originFromHeaders(headers, protocol);
  const allowed = allowedDashboardOrigins(config);
  const host = blankToUndefined(headers.get("host"));
  const sameOrigin = host !== undefined && origin === `${protocol}://${host}`;
  if (origin === undefined || (!allowed.has(origin) && !sameOrigin)) {
    throw new AppError(
      ErrorCode.CSRF_FORBIDDEN,
      "Request origin is not allowed.",
      403,
    );
  }
  if (normalized === "DELETE") {
    return;
  }
  const contentType = blankToUndefined(headers.get("content-type"));
  if (
    contentType === undefined ||
    !contentType.toLowerCase().startsWith("application/json")
  ) {
    throw new AppError(
      ErrorCode.INVALID_REQUEST,
      "JSON content type is required.",
      400,
    );
  }
}

function blankToUndefined(value: string | null): string | undefined {
  if (value === null || value === "") {
    return undefined;
  }
  return value;
}

export function allowedDashboardOrigins(config: EnvConfig): Set<string> {
  const origins = new Set<string>();
  try {
    origins.add(new URL(config.publicUrl).origin);
  } catch {
    // ignore invalid public URL
  }
  if (config.env !== "production") {
    origins.add("http://127.0.0.1:5173");
    origins.add("http://localhost:5173");
  }
  return origins;
}

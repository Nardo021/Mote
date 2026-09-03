import type { FastifyReply, FastifyRequest } from "fastify";

import { ADMIN_SESSION_COOKIE } from "../config/constants.js";
import type { EnvConfig } from "../config/env.js";
import { AppError, ErrorCode, unauthorized } from "../utils/errors.js";
import type { AuthenticatedAdmin } from "./adminTypes.js";
import type { SessionService } from "./sessionService.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function readSessionCookie(request: FastifyRequest): string | undefined {
  const cookies = request.cookies;
  if (cookies === undefined) {
    return undefined;
  }
  const value = cookies[ADMIN_SESSION_COOKIE];
  return value === "" ? undefined : value;
}

export function authenticateAdminRequest(
  request: FastifyRequest,
  sessions: SessionService,
): AuthenticatedAdmin {
  return sessions.authenticate(readSessionCookie(request));
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
    origins.add("http://127.0.0.1:3000");
    origins.add("http://localhost:3000");
  }
  return origins;
}

export function requestOrigin(request: FastifyRequest): string | undefined {
  const origin = headerValue(request.headers.origin);
  if (origin !== undefined) {
    return origin;
  }
  const referer = headerValue(request.headers.referer);
  if (referer !== undefined) {
    try {
      return new URL(referer).origin;
    } catch {
      return undefined;
    }
  }
  const host = headerValue(request.headers.host);
  if (host === undefined) {
    return undefined;
  }
  return `${request.protocol}://${host}`;
}

export function assertAdminMutationAllowed(
  request: FastifyRequest,
  config: EnvConfig,
): void {
  if (!MUTATING_METHODS.has(request.method)) {
    return;
  }
  const origin = requestOrigin(request);
  const allowed = allowedDashboardOrigins(config);
  const host = headerValue(request.headers.host);
  const sameOrigin =
    host !== undefined && origin === `${request.protocol}://${host}`;
  if (origin === undefined || (!allowed.has(origin) && !sameOrigin)) {
    throw new AppError(
      ErrorCode.CSRF_FORBIDDEN,
      "Request origin is not allowed.",
      403,
    );
  }
  if (request.method === "DELETE" && request.body === undefined) {
    return;
  }
  const contentType = headerValue(request.headers["content-type"]);
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

export function setSessionCookie(
  reply: FastifyReply,
  token: string,
  config: EnvConfig,
  expiresAt: number,
): void {
  reply.setCookie(ADMIN_SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: config.env === "production",
    sameSite: "lax",
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(
  reply: FastifyReply,
  config: EnvConfig,
): void {
  reply.clearCookie(ADMIN_SESSION_COOKIE, {
    path: "/",
    httpOnly: true,
    secure: config.env === "production",
    sameSite: "lax",
  });
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

import { ADMIN_EVENT_TOPICS } from "../admin/eventBus.js";
import type { AppContext } from "../appContext.js";
import { ADMIN_SESSION_COOKIE } from "../config/constants.js";
import { handleRelayHttp, type RelayHttpResult } from "../http/relayHttp.js";
import { AppError, ErrorCode, toErrorEnvelope } from "../utils/errors.js";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
  "X-Frame-Options": "DENY",
};

export async function handleWorkerRequest(
  request: Request,
  ctx: AppContext,
): Promise<Response> {
  const url = new URL(request.url);
  try {
    const body = await rawBody(request, ctx.config.maxBodyBytes);
    const result = await handleRelayHttp(
      {
        method: request.method,
        path: url.pathname,
        query: url.searchParams,
        headers: request.headers,
        ip: request.headers.get("cf-connecting-ip") ?? "unknown",
        protocol: url.protocol.replace(":", ""),
        hasParsedBody: false,
        ...(body === undefined ? {} : { rawBody: body }),
      },
      ctx,
    );
    return toResponse(result, ctx);
  } catch (error) {
    return json(errorResult(error));
  }
}

function toResponse(result: RelayHttpResult, ctx: AppContext): Response {
  if (result.kind === "unhandled") {
    return json(errorResult(new AppError(ErrorCode.INVALID_REQUEST, "Not found.", 404)));
  }
  if (result.kind === "sse") {
    return eventStream(ctx);
  }
  if (result.kind === "html") {
    return html(result.body, result.headers?.["Cache-Control"] ?? "no-store");
  }
  const headers = { ...(result.headers ?? {}) };
  if (result.session?.action === "set") {
    headers["Set-Cookie"] = sessionCookie(result.session.token, ctx, result.session.expiresAt);
  } else if (result.session?.action === "clear") {
    headers["Set-Cookie"] = clearSessionCookie(ctx);
  }
  return json({ status: result.status, body: result.body, headers });
}

async function rawBody(request: Request, maxBytes: number): Promise<string | undefined> {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }
  const text = await request.text();
  if (text.length > maxBytes) {
    throw new AppError(ErrorCode.INVALID_REQUEST, "Request body is too large.", 413);
  }
  return text;
}

function eventStream(ctx: AppContext): Response {
  const encoder = new TextEncoder();
  let unsubscribe = (): void => undefined;
  let ping: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          unsubscribe();
          if (ping !== undefined) {
            clearInterval(ping);
          }
        }
      };
      unsubscribe = ctx.adminEvents.subscribe((event) => {
        send(`data: ${JSON.stringify(event)}\n\n`);
      });
      ping = setInterval(() => {
        send(": ping\n\n");
      }, 15_000);
      send(`data: ${JSON.stringify({ topics: [...ADMIN_EVENT_TOPICS] })}\n\n`);
    },
    cancel() {
      unsubscribe();
      if (ping !== undefined) {
        clearInterval(ping);
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function sessionCookie(token: string, ctx: AppContext, expiresAt: number): string {
  const secure = ctx.config.env === "production" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secure}; Expires=${new Date(expiresAt).toUTCString()}`;
}

function clearSessionCookie(ctx: AppContext): string {
  const secure = ctx.config.env === "production" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax${secure}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

function errorResult(error: unknown): { status: number; body: unknown } {
  if (error instanceof AppError) {
    return { status: error.statusCode, body: toErrorEnvelope(error) };
  }
  return {
    status: 500,
    body: toErrorEnvelope(new AppError(ErrorCode.INTERNAL_ERROR, "Unexpected server failure.", 500)),
  };
}

function json(result: { status: number; body: unknown; headers?: Record<string, string> }): Response {
  const headers = new Headers({
    ...SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
  });
  if (result.headers) {
    for (const [key, value] of Object.entries(result.headers)) {
      headers.set(key, value);
    }
  }
  return new Response(JSON.stringify(result.body), { status: result.status, headers });
}

function html(body: string, cacheControl: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": cacheControl,
    },
  });
}

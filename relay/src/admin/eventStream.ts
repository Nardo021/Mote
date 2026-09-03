import type { FastifyReply, FastifyRequest } from "fastify";

import {
  ADMIN_EVENT_TOPICS,
  type AdminEventBus,
  type AdminEventPayload,
} from "./eventBus.js";

const SSE_PING_MS = 15_000;
const HELLO: AdminEventPayload = { topics: [...ADMIN_EVENT_TOPICS] };

export function writeAdminEventStream(
  request: FastifyRequest,
  reply: FastifyReply,
  bus: AdminEventBus,
): void {
  reply.hijack();
  const raw = reply.raw;
  raw.statusCode = 200;
  raw.setHeader("Content-Type", "text/event-stream");
  raw.setHeader("Cache-Control", "no-store");
  raw.setHeader("Connection", "keep-alive");
  raw.setHeader("X-Accel-Buffering", "no");
  raw.flushHeaders();
  request.raw.setTimeout(0);
  raw.setTimeout(0);

  let closed = false;
  const send = (chunk: string): void => {
    if (closed) {
      return;
    }
    try {
      raw.write(chunk);
    } catch {
      cleanup();
    }
  };

  const cleanup = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    clearInterval(ping);
    unsubscribe();
  };

  const unsubscribe = bus.subscribe((event) => {
    send(`data: ${JSON.stringify(event)}\n\n`);
  });
  const ping = setInterval(() => {
    send(": ping\n\n");
  }, SSE_PING_MS);
  ping.unref?.();

  send(`data: ${JSON.stringify(HELLO)}\n\n`);

  raw.once("close", cleanup);
  raw.once("error", cleanup);
  request.raw.once("close", cleanup);
}

import type { FastifyRequest } from "fastify";
import type { WebSocket } from "ws";

import type { AppContext } from "../appContext.js";
import { AppError } from "../utils/errors.js";
import { nowMs } from "../utils/time.js";

function pairQuery(request: FastifyRequest): {
  requestId: string | null;
  pairSecret: string | null;
} {
  const query = request.query as {
    request_id?: string;
    pair_secret?: string;
  };
  if (query.request_id && query.pair_secret) {
    return { requestId: query.request_id, pairSecret: query.pair_secret };
  }
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    return {
      requestId: url.searchParams.get("request_id"),
      pairSecret: url.searchParams.get("pair_secret"),
    };
  } catch {
    return { requestId: null, pairSecret: null };
  }
}

export function handlePairSocket(
  socket: WebSocket,
  request: FastifyRequest,
  ctx: AppContext,
): void {
  const { requestId, pairSecret } = pairQuery(request);
  if (
    requestId === null ||
    requestId === "" ||
    pairSecret === null ||
    pairSecret === ""
  ) {
    socket.close(1008, "invalid_credentials");
    return;
  }

  let record;
  try {
    record = ctx.pairing.authenticateSocket(requestId, pairSecret);
  } catch (error) {
    if (error instanceof AppError) {
      socket.close(1008, "invalid_credentials");
      return;
    }
    socket.close(1011, "socket_error");
    return;
  }

  const previous = ctx.pairSockets.register(record.id, socket);
  if (previous && previous !== socket) {
    try {
      previous.close(1000, "superseded");
    } catch {
      // ignore
    }
  }
  const sendPending = (): void => {
    ctx.pairSockets.send(record.id, { type: "pair_pending", version: 1 });
  };
  if (socket.readyState === socket.OPEN) {
    sendPending();
  } else {
    socket.once("open", sendPending);
  }

  const remainingMs = Math.max(0, record.expiresAt - nowMs());
  const expireTimer = setTimeout(() => {
    ctx.pairing.expireStale();
  }, remainingMs + 1);
  expireTimer.unref?.();

  const cleanup = (): void => {
    clearTimeout(expireTimer);
    ctx.pairSockets.remove(record.id, socket);
  };
  socket.on("close", cleanup);
  socket.on("error", () => {
    request.log.warn({ pair_request_id: record.id }, "pair websocket error");
    try {
      socket.close(1011, "socket_error");
    } catch {
      // ignore
    }
  });
}

import type { AppContext } from "../appContext.js";
import { parsePairAuthMessage } from "../protocol/codec.js";
import { SocketClose } from "../protocol/closeReasons.js";
import { AppError } from "../utils/errors.js";
import type { RelaySocket } from "../websocket/connectionRegistry.js";
import type { PairRequestRecord } from "./pairTypes.js";

export const PAIR_AUTH_CLOSE = {
  invalidCredentials: SocketClose.invalidCredentials,
  authTimeout: SocketClose.authTimeout,
  socketError: SocketClose.socketError,
} as const;

export type PairAuthClose = (typeof PAIR_AUTH_CLOSE)[keyof typeof PAIR_AUTH_CLOSE];

export function authenticatePairingFrame(
  ctx: AppContext,
  raw: string,
): { ok: true; record: PairRequestRecord } | { ok: false; close: PairAuthClose } {
  const parsed = parsePairAuthMessage(raw);
  if (!parsed.ok) {
    return { ok: false, close: PAIR_AUTH_CLOSE.invalidCredentials };
  }
  try {
    return { ok: true, record: ctx.pairing.authenticateSocket(parsed.message.request_id, parsed.message.pair_secret) };
  } catch (error) {
    return {
      ok: false,
      close: error instanceof AppError ? PAIR_AUTH_CLOSE.invalidCredentials : PAIR_AUTH_CLOSE.socketError,
    };
  }
}

export function registerAuthenticatedPairSocket(
  ctx: AppContext,
  socket: RelaySocket,
  record: PairRequestRecord,
): void {
  const previous = ctx.pairSockets.register(record.id, socket);
  if (previous && previous !== socket) {
    try {
      previous.close(SocketClose.superseded.code, SocketClose.superseded.reason);
    } catch {
      // ignore
    }
  }
  ctx.pairSockets.send(record.id, { type: "pair_pending", version: 1 });
}

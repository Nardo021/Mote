import { PROTOCOL_VERSION } from "../config/constants.js";
import type { RelaySocket } from "../websocket/connectionRegistry.js";
import type { PairOutgoingMessage } from "./pairTypes.js";

type RegisteredPairSocket = {
  requestId: string;
  socket: RelaySocket;
};

export class PairSocketRegistry {
  private readonly sockets = new Map<string, RegisteredPairSocket>();

  register(requestId: string, socket: RelaySocket): RelaySocket | undefined {
    const previous = this.sockets.get(requestId);
    this.sockets.set(requestId, { requestId, socket });
    return previous?.socket;
  }

  send(requestId: string, message: PairOutgoingMessage): boolean {
    const registered = this.sockets.get(requestId);
    if (!registered) {
      return false;
    }
    const payload = JSON.stringify({ ...message, version: PROTOCOL_VERSION });
    try {
      registered.socket.send(payload);
      return true;
    } catch {
      return false;
    }
  }

  close(requestId: string, code: number, reason: string): void {
    const registered = this.sockets.get(requestId);
    if (!registered) {
      return;
    }
    try {
      registered.socket.close(code, reason);
    } catch {
      // ignore
    }
    this.sockets.delete(requestId);
  }

  remove(requestId: string, socket: RelaySocket): void {
    const registered = this.sockets.get(requestId);
    if (registered?.socket === socket) {
      this.sockets.delete(requestId);
    }
  }
}

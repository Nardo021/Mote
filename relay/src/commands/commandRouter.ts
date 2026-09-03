import { encodeOutgoing } from "../protocol/codec.js";
import type { CommandMessage } from "../protocol/messages.js";
import type { ConnectionRegistry } from "../websocket/connectionRegistry.js";

export class CommandRouter {
  constructor(private readonly registry: ConnectionRegistry) {}

  send(command: CommandMessage): boolean {
    const connection = this.registry.get(command.device_id);
    if (!connection) {
      return false;
    }
    connection.socket.send(encodeOutgoing(command));
    return true;
  }
}

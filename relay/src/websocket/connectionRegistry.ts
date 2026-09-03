export type RelaySocket = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readonly readyState: number;
};

export type DeviceConnection = {
  deviceId: string;
  connectionId: string;
  socket: RelaySocket;
  authenticatedAt: number;
  lastHeartbeat: number;
  lastSeen: number;
  remoteAddress?: string;
};

export class ConnectionRegistry {
  private readonly connections = new Map<string, DeviceConnection>();

  get(deviceId: string): DeviceConnection | undefined {
    return this.connections.get(deviceId);
  }

  isOnline(deviceId: string): boolean {
    return this.connections.has(deviceId);
  }

  list(): DeviceConnection[] {
    return [...this.connections.values()];
  }

  register(connection: DeviceConnection): DeviceConnection | undefined {
    const previous = this.connections.get(connection.deviceId);
    this.connections.set(connection.deviceId, connection);
    return previous;
  }

  remove(deviceId: string, connectionId: string): boolean {
    const current = this.connections.get(deviceId);
    if (!current || current.connectionId !== connectionId) {
      return false;
    }
    this.connections.delete(deviceId);
    return true;
  }

  touch(deviceId: string, connectionId: string, at: number): boolean {
    const current = this.connections.get(deviceId);
    if (!current || current.connectionId !== connectionId) {
      return false;
    }
    current.lastHeartbeat = at;
    current.lastSeen = at;
    return true;
  }

  staleConnections(now: number, staleMs: number): DeviceConnection[] {
    return this.list().filter(
      (connection) => now - connection.lastHeartbeat > staleMs,
    );
  }

  closeDevice(
    deviceId: string,
    code = 1000,
    reason = "device_disabled",
  ): boolean {
    const current = this.connections.get(deviceId);
    if (!current) {
      return false;
    }
    try {
      current.socket.close(code, reason);
    } catch {
      // ignore
    }
    return true;
  }

  closeAll(): void {
    for (const connection of this.list()) {
      try {
        connection.socket.close(1001, "server_shutdown");
      } catch {
        // ignore close errors during shutdown
      }
    }
    this.connections.clear();
  }
}

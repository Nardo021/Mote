import { createHash, randomBytes, randomUUID } from "node:crypto";

import { parseIncomingDeviceMessage, rawDataToString } from "../protocol/codec.js";
import type { CommandMessage, CommandResultMessage } from "../protocol/messages.js";
import { PROTOCOL_VERSION } from "../protocol/protocolVersion.js";
import { isUuid } from "../utils/ids.js";
import type { CloudD1Database } from "./identityRepository.js";
import {
  authorizeCloudCommandAdmission,
  authorizeCloudDeviceAdmission,
} from "./tenantAdmission.js";

const COMMAND_TTL_MS = 10_000;
const COMMAND_WAIT_MS = 10_500;
const STALE_SOCKET_MS = 90_000;
const AUTH_GRACE_MS = 5_000;
const MAX_FRAME_BYTES = 8_192;
const MAX_PENDING = 32;

export type CloudSocketAttachment = {
  kind: "cloud-device";
  expectedDeviceId: string;
  ownerAccountId: string;
  connectionId: string;
  openedAtMs: number;
  authenticatedDeviceId?: string;
  credentialHash?: string;
  lastHeartbeatMs?: number;
  actions?: readonly string[];
};

/** Same methods offered by Cloudflare's hibernatable server WebSocket. */
export interface CloudRealtimeSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(value: CloudSocketAttachment): void;
  deserializeAttachment(): CloudSocketAttachment | null;
}

export type CloudCommandOutcome = Readonly<{
  httpStatus: number;
  status: "offline" | "busy" | "timeout" | "completed" | "failed" |
          "expired" | "invalid" | "unsupported" | "permission_required";
  commandId?: string;
}>;

type Pending = {
  deviceId: string;
  socket: CloudRealtimeSocket;
  expiresAtMs: number;
  resolve: (value: CloudCommandOutcome) => void;
  timer: ReturnType<typeof setTimeout>;
};

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function attachmentIsValid(value: CloudSocketAttachment | null, owner: string): value is CloudSocketAttachment {
  return value !== null && value.kind === "cloud-device" &&
    isUuid(value.expectedDeviceId) && value.ownerAccountId === owner &&
    typeof value.connectionId === "string" && isUuid(value.connectionId) &&
    Number.isSafeInteger(value.openedAtMs) && value.openedAtMs > 0;
}

/**
 * Cloud-only realtime state machine. The DO owns one of these per tenant.
 * No offline queue or persistent command log: a DO restart fails any in-flight
 * command, and all new dispatches require an authenticated online socket.
 */
export class CloudTenantRealtime {
  private readonly devices = new Map<string, CloudRealtimeSocket>();
  private readonly pending = new Map<string, Pending>();

  constructor(
    private readonly db: CloudD1Database,
    readonly ownerAccountId: string,
    private readonly now: () => number = Date.now,
  ) {
    if (!isUuid(ownerAccountId)) throw new Error("Invalid tenant owner.");
  }

  /** The WS upgrade is PROVISIONAL until a valid Protocol v1 auth frame. */
  accept(socket: CloudRealtimeSocket, expectedDeviceId: string): void {
    if (!isUuid(expectedDeviceId)) throw new Error("Invalid device ID.");
    socket.serializeAttachment({
      kind: "cloud-device",
      expectedDeviceId,
      ownerAccountId: this.ownerAccountId,
      connectionId: randomUUID(),
      openedAtMs: this.now(),
    });
  }

  /** Restore only attachment metadata; recheck D1 before accepting frames. */
  restore(socket: CloudRealtimeSocket): void {
    const a = socket.deserializeAttachment();
    if (!attachmentIsValid(a, this.ownerAccountId) ||
        !a.authenticatedDeviceId || !isUuid(a.authenticatedDeviceId) ||
        a.expectedDeviceId !== a.authenticatedDeviceId ||
        !/^[0-9a-f]{64}$/.test(a.credentialHash ?? "")) {
      socket.close(4401, "invalid_session");
      return;
    }
    const old = this.devices.get(a.authenticatedDeviceId);
    if (old && old !== socket) old.close(4409, "superseded");
    this.devices.set(a.authenticatedDeviceId, socket);
  }

  private async matchesD1(a: CloudSocketAttachment): Promise<boolean> {
    if (!a.credentialHash || !a.authenticatedDeviceId) return false;
    const row = await this.db.prepare(
      `SELECT d.id FROM cloud_devices d
       INNER JOIN cloud_accounts acc ON acc.id = d.owner_account_id
       WHERE d.id = ? AND d.owner_account_id = ?
         AND d.credential_hash = ? AND d.status = 'active'
         AND acc.status = 'active'`,
    ).bind(a.authenticatedDeviceId, this.ownerAccountId, a.credentialHash)
      .first<{ id: string }>();
    return row?.id === a.authenticatedDeviceId;
  }

  async onMessage(socket: CloudRealtimeSocket, raw: string | ArrayBuffer): Promise<void> {
    const a = socket.deserializeAttachment();
    if (!attachmentIsValid(a, this.ownerAccountId)) {
      socket.close(4401, "invalid_session");
      return;
    }
    const text = rawDataToString(raw);
    if (Buffer.byteLength(text, "utf8") > MAX_FRAME_BYTES) {
      this.disconnect(socket, 4400, "invalid_frame");
      return;
    }
    const parsed = parseIncomingDeviceMessage(text);
    if (!parsed.ok) {
      this.disconnect(socket, 4400, "invalid_frame");
      return;
    }

    if (!a.authenticatedDeviceId) {
      if (parsed.message.type !== "auth" ||
          parsed.message.device_id !== a.expectedDeviceId) {
        this.disconnect(socket, 4401, "invalid_credentials");
        return;
      }
      const verified = await authorizeCloudDeviceAdmission(
        this.db, a.expectedDeviceId, parsed.message.credential,
      );
      if (!verified || verified.tenantAccountId !== this.ownerAccountId ||
          parsed.message.actions?.includes("lock") === false) {
        this.disconnect(socket, 4401, "invalid_credentials");
        return;
      }
      const previous = this.devices.get(verified.deviceId);
      if (previous && previous !== socket) this.disconnect(previous, 4409, "superseded");
      const lastHeartbeatMs = this.now();
      socket.serializeAttachment({
        ...a,
        authenticatedDeviceId: verified.deviceId,
        credentialHash: digest(parsed.message.credential),
        lastHeartbeatMs,
        actions: parsed.message.actions ?? ["lock"],
      });
      this.devices.set(verified.deviceId, socket);
      socket.send(JSON.stringify({ type: "auth_result", version: PROTOCOL_VERSION, status: "ok" }));
      return;
    }

    if (this.devices.get(a.authenticatedDeviceId) !== socket ||
        !(await this.matchesD1(a))) {
      this.disconnect(socket, 4401, "revoked_or_superseded");
      return;
    }
    switch (parsed.message.type) {
      case "auth":
        this.disconnect(socket, 4400, "duplicate_auth");
        return;
      case "heartbeat":
        if (parsed.message.device_id !== a.authenticatedDeviceId) {
          this.disconnect(socket, 4400, "wrong_device");
          return;
        }
        socket.serializeAttachment({ ...a, lastHeartbeatMs: this.now() });
        socket.send(JSON.stringify({
          type: "heartbeat_ack",
          version: PROTOCOL_VERSION,
          sent_at: parsed.message.sent_at,
          server_at: this.now(),
        }));
        return;
      case "command_result":
        this.onResult(socket, a.authenticatedDeviceId, parsed.message);
        return;
      default: {
        const neverMessage: never = parsed.message;
        void neverMessage;
      }
    }
  }

  private onResult(socket: CloudRealtimeSocket, deviceId: string, result: CommandResultMessage): void {
    const pending = this.pending.get(result.command_id);
    if (!pending || pending.socket !== socket || pending.deviceId !== deviceId) return;
    if (this.now() > pending.expiresAtMs) {
      this.complete(result.command_id, { httpStatus: 504, status: "timeout", commandId: result.command_id });
      return;
    }
    this.complete(result.command_id, {
      httpStatus: 200,
      status: result.status,
      commandId: result.command_id,
    });
  }

  /**
   * The DO independently revalidates the caller's access token and ownership.
   * A gateway caller cannot choose a different tenant or issue other actions.
   */
  async command(accessToken: string, deviceId: string, action: unknown): Promise<CloudCommandOutcome> {
    const verdict = await authorizeCloudCommandAdmission(this.db, accessToken, deviceId, action, this.now());
    if (!verdict.allowed || verdict.tenantAccountId !== this.ownerAccountId) {
      return { httpStatus: verdict.allowed ? 404 : verdict.status, status: "failed" };
    }
    const socket = this.devices.get(deviceId);
    if (!socket) return { httpStatus: 409, status: "offline" };
    const a = socket.deserializeAttachment();
    if (!attachmentIsValid(a, this.ownerAccountId) ||
        a.authenticatedDeviceId !== deviceId || !(await this.matchesD1(a))) {
      this.disconnect(socket, 4401, "revoked_or_superseded");
      return { httpStatus: 409, status: "offline" };
    }
    if (!a.actions?.includes("lock")) {
      return { httpStatus: 422, status: "unsupported" };
    }
    if (this.pending.size >= MAX_PENDING ||
        [...this.pending.values()].some(p => p.deviceId === deviceId)) {
      return { httpStatus: 429, status: "busy" };
    }
    const createdAt = this.now();
    const command: CommandMessage = {
      type: "command",
      version: PROTOCOL_VERSION,
      id: `cmd_${randomUUID()}`,
      device_id: deviceId,
      action: "lock",
      created_at: createdAt,
      expires_at: createdAt + COMMAND_TTL_MS,
      nonce: randomBytes(16).toString("base64url"),
    };
    return new Promise<CloudCommandOutcome>((resolve) => {
      const timer = setTimeout(() => {
        this.complete(command.id, { httpStatus: 504, status: "timeout", commandId: command.id });
      }, COMMAND_WAIT_MS);
      this.pending.set(command.id, {
        socket, deviceId, expiresAtMs: command.expires_at, resolve, timer,
      });
      try {
        socket.send(JSON.stringify(command));
      } catch {
        this.disconnect(socket, 1011, "transport_error");
      }
    });
  }

  private complete(id: string, outcome: CloudCommandOutcome): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    pending.resolve(outcome);
  }

  disconnect(socket: CloudRealtimeSocket, code = 1000, reason = "closed"): void {
    const a = socket.deserializeAttachment();
    if (a?.authenticatedDeviceId && this.devices.get(a.authenticatedDeviceId) === socket) {
      this.devices.delete(a.authenticatedDeviceId);
    }
    for (const [id, p] of this.pending) {
      if (p.socket === socket) {
        this.complete(id, { httpStatus: 409, status: "offline", commandId: id });
      }
    }
    try {
      socket.close(code, reason);
    } catch {
      // Closing an already closed socket is safe to ignore.
    }
  }

  onClose(socket: CloudRealtimeSocket): void {
    this.disconnect(socket);
  }

  /** Called from a Durable Object alarm. No stale sockets or queued commands. */
  sweep(sockets: readonly CloudRealtimeSocket[]): void {
    const now = this.now();
    for (const socket of sockets) {
      const a = socket.deserializeAttachment();
      if (!attachmentIsValid(a, this.ownerAccountId)) {
        this.disconnect(socket, 4401, "invalid_session");
      } else if (!a.authenticatedDeviceId && now - a.openedAtMs > AUTH_GRACE_MS) {
        this.disconnect(socket, 4408, "auth_timeout");
      } else if (a.authenticatedDeviceId &&
          now - (a.lastHeartbeatMs ?? a.openedAtMs) > STALE_SOCKET_MS) {
        this.disconnect(socket, 4408, "heartbeat_timeout");
      }
    }
  }
}

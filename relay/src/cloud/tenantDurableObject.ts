import { timingSafeEqual } from "node:crypto";
import { DurableObject } from "cloudflare:workers";

import { isUuid } from "../utils/ids.js";
import type { CloudD1Database } from "./identityRepository.js";
import {
  CloudTenantRealtime,
  type CloudRealtimeSocket,
} from "./realtimeCore.js";

type TenantEnv = {
  CLOUD_DB?: CloudD1Database;
  MOTE_CLOUD_INTERNAL_SECRET?: string;
};

const ALARM_INTERVAL_MS = 15_000;
const OWNER_KEY = "moteCloudTenantOwnerId";

function verifiedInternalRequest(request: Request, secret: string | undefined): boolean {
  const provided = request.headers.get("X-Mote-Cloud-Internal");
  if (!secret || secret.length < 32 || !provided ||
      Buffer.byteLength(provided) !== Buffer.byteLength(secret)) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
}
function reply(status: number, payload: object): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
function asCloudSocket(socket: WebSocket): CloudRealtimeSocket {
  return socket as unknown as CloudRealtimeSocket;
}

/**
 * One distinct hibernating DO per account. The gateway must derive owner
 * solely from D1, not a user-supplied tenant ID. This DO independently
 * revalidates all device credentials and phone session tokens using D1.
 */
export class MoteCloudTenant extends DurableObject<TenantEnv> {
  #ownerId: string | undefined;
  #realtime: CloudTenantRealtime | undefined;
  #queues = new WeakMap<WebSocket, Promise<void>>();

  constructor(ctx: DurableObjectState, env: TenantEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const ownerId = await ctx.storage.get<string>(OWNER_KEY);
      if (ownerId && isUuid(ownerId) && env.CLOUD_DB) {
        this.#ownerId = ownerId;
        this.#realtime = new CloudTenantRealtime(env.CLOUD_DB, ownerId);
        for (const socket of ctx.getWebSockets()) {
          this.#realtime.restore(asCloudSocket(socket));
        }
      } else {
        // Do not accept old sockets when the owner boundary is unknown.
        for (const socket of ctx.getWebSockets()) {
          try { socket.close(4401, "invalid_tenant"); } catch { /* ignore */ }
        }
      }
    });
  }

  private async bindOwner(ownerId: string): Promise<boolean> {
    if (!isUuid(ownerId) || !this.env.CLOUD_DB) return false;
    if (this.#ownerId !== undefined) return this.#ownerId === ownerId;
    // Durable Object storage is the stable tenant boundary across hibernation.
    return this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<string>(OWNER_KEY);
      if (stored !== undefined && stored !== ownerId) return false;
      if (stored === undefined) await this.ctx.storage.put(OWNER_KEY, ownerId);
      this.#ownerId = ownerId;
      this.#realtime = new CloudTenantRealtime(this.env.CLOUD_DB!, ownerId);
      return true;
    });
  }

  override async fetch(request: Request): Promise<Response> {
    if (!verifiedInternalRequest(request, this.env.MOTE_CLOUD_INTERNAL_SECRET)) {
      return reply(404, { error: "not_found" });
    }
    const owner = request.headers.get("X-Mote-Cloud-Owner") ?? "";
    if (!(await this.bindOwner(owner)) || !this.#realtime || !this.env.CLOUD_DB) {
      return reply(404, { error: "not_found" });
    }
    const url = new URL(request.url);

    if (request.method === "GET" && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const match = /^\/internal\/ws\/([0-9a-f-]{36})$/i.exec(url.pathname);
      if (!match || !match[1] || !isUuid(match[1])) return reply(404, { error: "not_found" });
      const deviceId = match[1];
      // This is a provisional route, NOT authenticated admission. The
      // following Protocol v1 auth frame must prove the device credential.
      const row = await this.env.CLOUD_DB.prepare(
        `SELECT d.id FROM cloud_devices d JOIN cloud_accounts a
         ON a.id = d.owner_account_id
         WHERE d.id = ? AND d.owner_account_id = ? AND d.status = 'active'
           AND a.status = 'active'`,
      ).bind(deviceId, owner).first<{ id: string }>();
      if (!row) return reply(404, { error: "not_found" });
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      this.ctx.acceptWebSocket(server);
      this.#realtime.accept(asCloudSocket(server), deviceId);
      await this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === "POST" && url.pathname === "/internal/command") {
      let body: unknown;
      try {
        const raw = await request.text();
        if (Buffer.byteLength(raw, "utf8") > 4096) return reply(413, { error: "invalid_request" });
        body = JSON.parse(raw);
      } catch {
        return reply(400, { error: "invalid_request" });
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return reply(400, { error: "invalid_request" });
      }
      const record = body as Record<string, unknown>;
      if (typeof record.accessToken !== "string" ||
          typeof record.deviceId !== "string" ||
          record.action !== "lock") {
        return reply(400, { error: "invalid_request" });
      }
      const outcome = await this.#realtime.command(
        record.accessToken, record.deviceId, record.action,
      );
      return reply(outcome.httpStatus, {
        status: outcome.status,
        ...(outcome.commandId ? { command_id: outcome.commandId } : {}),
      });
    }
    return reply(404, { error: "not_found" });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (!this.#realtime) {
      try { ws.close(4401, "invalid_tenant"); } catch { /* ignore */ }
      return;
    }
    // Serializes frames per device, including the initial asynchronous D1
    // credential check; a heartbeat cannot leap ahead of the auth frame.
    const predecessor = this.#queues.get(ws) ?? Promise.resolve();
    const current = predecessor.then(
      () => this.#realtime!.onMessage(asCloudSocket(ws), message),
    );
    this.#queues.set(ws, current.catch(() => {
      this.#realtime?.disconnect(asCloudSocket(ws), 1011, "validation_failed");
    }));
    await current.catch(() => undefined);
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    this.#realtime?.onClose(asCloudSocket(ws));
  }

  override async alarm(): Promise<void> {
    this.#realtime?.sweep(this.ctx.getWebSockets().map(asCloudSocket));
    if (this.ctx.getWebSockets().length > 0) {
      await this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
    }
  }
}

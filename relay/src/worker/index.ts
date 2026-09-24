import { DurableObject } from "cloudflare:workers";

import { createAppContext, type AppContext } from "../appContext.js";
import { loadConfig } from "../config/env.js";
import { migrate } from "../storage/migrations.js";
import { openSqlStorageDatabase } from "../storage/sqlStorage.js";
import { handleWorkerRequest } from "./api.js";
import {
  acceptPairSocket,
  deviceAttachment,
  onDeviceMessage,
  onSocketClose,
  restoreSocket,
  sweepSockets,
  type HibernatingSocket,
} from "./sockets.js";
import { DEVICE_WEBSOCKET_PATH, PAIR_WEBSOCKET_PATH } from "../config/constants.js";

export interface Env {
  RELAY: DurableObjectNamespace<MoteRelay>;
  ASSETS: Fetcher;
  MOTE_ADMIN_USERNAME?: string;
  MOTE_ADMIN_PASSWORD?: string;
  MOTE_PUBLIC_URL?: string;
  MOTE_SHORTCUT_ICLOUD_URL?: string;
}

export class MoteRelay extends DurableObject<Env> {
  #app: AppContext | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const database = openSqlStorageDatabase(ctx.storage.sql, (fn) =>
        ctx.storage.transactionSync(fn),
      );
      migrate(database);
      const app = createAppContext(workerConfig(env), database);
      const password = env.MOTE_ADMIN_PASSWORD?.trim() ?? "";
      if (!app.admins.hasAny() && password !== "") {
        app.admins.create(env.MOTE_ADMIN_USERNAME?.trim() || "admin", password);
      }
      for (const socket of ctx.getWebSockets()) {
        restoreSocket(asHibernating(socket), app);
      }
      this.#app = app;
      await ctx.storage.setAlarm(Date.now() + app.config.staleSweepIntervalMs);
    });
  }

  override async fetch(request: Request): Promise<Response> {
    const app = this.app();
    const url = new URL(request.url);
    if (!this.env.MOTE_PUBLIC_URL) {
      app.config.publicUrl = url.origin;
    }
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      return this.acceptWebSocket(request, url, app);
    }
    return handleWorkerRequest(request, app);
  }

  override async alarm(): Promise<void> {
    const app = this.app();
    sweepSockets(this.ctx.getWebSockets().map(asHibernating), app);
    await this.ctx.storage.setAlarm(Date.now() + app.config.staleSweepIntervalMs);
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    onDeviceMessage(asHibernating(ws), this.app(), message);
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    onSocketClose(asHibernating(ws), this.app());
  }

  private acceptWebSocket(request: Request, url: URL, app: AppContext): Response {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    const hibernating = asHibernating(server);
    if (url.pathname === DEVICE_WEBSOCKET_PATH) {
      const attachment = deviceAttachment(request.headers.get("cf-connecting-ip") ?? "");
      hibernating.serializeAttachment(attachment);
    } else if (url.pathname === PAIR_WEBSOCKET_PATH) {
      acceptPairSocket(
        hibernating,
        app,
        url.searchParams.get("request_id"),
        url.searchParams.get("pair_secret"),
      );
    } else {
      server.close(1008, "invalid_credentials");
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  private app(): AppContext {
    if (this.#app === undefined) {
      throw new Error("Mote Relay is not ready.");
    }
    return this.#app;
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (shouldProxyToRelay(url.pathname)) {
      const stub = env.RELAY.get(env.RELAY.idFromName("mote"));
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

function shouldProxyToRelay(pathname: string): boolean {
  return (
    pathname === "/health" ||
    pathname === "/ready" ||
    pathname.startsWith("/v1/") ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/s/")
  );
}

function workerConfig(env: Env) {
  const publicUrl = env.MOTE_PUBLIC_URL?.trim();
  return loadConfig({
    env: "production",
    publicUrl: publicUrl && publicUrl !== "" ? publicUrl : "https://mote.workers.dev",
    databasePath: "cloudflare",
    dashboardDist: "",
    shortcutIcloudUrl: blankToNull(env.MOTE_SHORTCUT_ICLOUD_URL),
  });
}

function blankToNull(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function asHibernating(socket: WebSocket): HibernatingSocket {
  return socket;
}

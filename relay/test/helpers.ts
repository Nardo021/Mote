import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { WebSocket, WebSocketServer } from "ws";

import { createAppContext, type AppContext } from "../src/appContext.js";
import { loadConfig, type EnvConfig } from "../src/config/env.js";
import { DEVICE_WEBSOCKET_PATH, PAIR_WEBSOCKET_PATH } from "../src/config/constants.js";
import { openMemoryDatabase, type MoteDatabase } from "../src/storage/database.js";
import { handleWorkerRequest } from "../src/worker/api.js";
import {
  beginPairSocket,
  deviceAttachment,
  onDeviceMessage,
  onPairMessage,
  onSocketClose,
  sweepSockets,
  type HibernatingSocket,
  type SocketAttachment,
} from "../src/worker/sockets.js";

const DEV_ORIGIN = "http://127.0.0.1:8787";

export type InjectOptions = {
  method: string;
  url: string;
  headers?: Record<string, string | undefined>;
  payload?: unknown;
};

export type InjectResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  json: <T = any>() => T;
};

export type TestServer = {
  app: {
    inject: (options: InjectOptions) => Promise<InjectResult>;
  };
  ctx: AppContext;
  db: MoteDatabase;
  port: number;
  baseUrl: string;
  wsUrl: string;
};

class NodeHibernatingSocket implements HibernatingSocket {
  attachment: SocketAttachment | null = null;
  private readonly closedPromise: Promise<void>;

  constructor(private readonly socket: WebSocket) {
    this.closedPromise = new Promise((resolve) => {
      socket.once("close", () => resolve());
    });
  }

  whenClosed(): Promise<void> {
    return this.closedPromise;
  }

  get readyState(): number {
    return this.socket.readyState;
  }

  send(data: string): void {
    this.socket.send(data);
  }

  close(code?: number, reason?: string): void {
    this.socket.close(code, reason);
  }

  serializeAttachment(value: SocketAttachment): void {
    this.attachment = value;
  }

  deserializeAttachment(): SocketAttachment | null {
    return this.attachment;
  }
}

export function testConfig(overrides: Partial<EnvConfig> = {}): EnvConfig {
  return loadConfig({
    env: "test",
    publicUrl: DEV_ORIGIN,
    logLevel: "silent",
    commandTtlMs: 10_000,
    commandTimeoutMs: 250,
    heartbeatStaleMs: 90_000,
    authTimeoutMs: 150,
    maxBodyBytes: 16_384,
    lastSeenPersistMs: 60_000,
    rateLimitMax: 10,
    rateLimitWindowMs: 10_000,
    maxPendingCommands: 32,
    staleSweepIntervalMs: 50_000,
    ...overrides,
  });
}

export async function startTestServer(
  overrides: Partial<EnvConfig> = {},
): Promise<TestServer> {
  const config = testConfig(overrides);
  const db = openMemoryDatabase();
  const ctx = createAppContext(config, db);
  const sockets = new Set<NodeHibernatingSocket>();
  let stopped = false;
  const httpServer = createServer((request, response) => {
    void serveHttp(request, response, ctx).catch(() => {
      if (!response.headersSent) {
        response.statusCode = 500;
      }
      response.end();
    });
  });
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (request, socket, head) => {
    let url: URL;
    try {
      url = new URL(request.url ?? "/", "http://127.0.0.1");
    } catch {
      socket.destroy();
      return;
    }
    if (url.pathname !== DEVICE_WEBSOCKET_PATH && url.pathname !== PAIR_WEBSOCKET_PATH) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      const hibernating = new NodeHibernatingSocket(ws);
      sockets.add(hibernating);
      if (url.pathname === DEVICE_WEBSOCKET_PATH) {
        hibernating.serializeAttachment(deviceAttachment(remoteAddress(request)));
      } else {
        beginPairSocket(hibernating);
      }
      ws.on("message", (data) => {
        const attachment = hibernating.deserializeAttachment();
        if (attachment?.kind === "pair") {
          onPairMessage(hibernating, ctx, data);
          return;
        }
        onDeviceMessage(hibernating, ctx, data);
      });
      ws.on("close", () => {
        sockets.delete(hibernating);
        onSocketClose(hibernating, ctx);
      });
    });
  });

  const sweep = setInterval(() => {
    if (stopped) {
      return;
    }
    sweepSockets([...sockets], ctx);
  }, 20);
  sweep.unref();

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });
  const address = httpServer.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("Failed to bind test server");
  }
  const port = (address as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    app: {
      inject: (options) => injectRequest(baseUrl, options),
    },
    ctx,
    db,
    port,
    baseUrl,
    wsUrl: `ws://127.0.0.1:${port}${DEVICE_WEBSOCKET_PATH}`,
    close: async () => {
      stopped = true;
      clearInterval(sweep);
      const open = [...sockets];
      for (const socket of open) {
        try {
          socket.close(1001, "shutdown");
        } catch {
          // already closing
        }
      }
      await Promise.all(open.map((socket) => socket.whenClosed()));
      wss.close();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      db.close();
    },
  } as TestServer & { close: () => Promise<void> };
}

export async function stopTestServer(server: TestServer): Promise<void> {
  const closable = server as TestServer & { close?: () => Promise<void> };
  if (closable.close) {
    await closable.close();
    return;
  }
  server.db.close();
}

async function serveHttp(
  request: IncomingMessage,
  response: ServerResponse,
  ctx: AppContext,
): Promise<void> {
  const host = request.headers.host ?? "127.0.0.1";
  const url = new URL(request.url ?? "/", `http://${host}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) {
      continue;
    }
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  if (!headers.has("cf-connecting-ip")) {
    headers.set("cf-connecting-ip", "127.0.0.1");
  }
  const body = await readRawBody(request);
  const method = request.method ?? "GET";
  const init: RequestInit = { method, headers };
  if (body !== undefined && method !== "GET" && method !== "HEAD") {
    init.body = body;
  }
  const workerResponse = await handleWorkerRequest(new Request(url, init), ctx);
  writeHead(response, workerResponse);
  if (workerResponse.body === null) {
    response.end();
    return;
  }
  const reader = workerResponse.body.getReader();
  const stop = () => {
    void reader.cancel().catch(() => undefined);
  };
  response.on("close", stop);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        response.end();
        return;
      }
      if (!response.write(value)) {
        await new Promise<void>((resolve) => {
          response.once("drain", () => resolve());
        });
      }
    }
  } finally {
    response.off("close", stop);
  }
}

function writeHead(response: ServerResponse, workerResponse: Response): void {
  const cookies = workerResponse.headers.getSetCookie();
  response.statusCode = workerResponse.status;
  workerResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      return;
    }
    response.setHeader(key, value);
  });
  if (cookies.length > 0) {
    response.setHeader("set-cookie", cookies);
  }
}

function readRawBody(request: IncomingMessage): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}

function remoteAddress(request: IncomingMessage): string {
  return request.socket.remoteAddress ?? "127.0.0.1";
}

export async function injectRequest(
  baseUrl: string,
  options: InjectOptions,
): Promise<InjectResult> {
  const headers = new Headers();
  if (options.headers) {
    for (const [key, value] of Object.entries(options.headers)) {
      if (value !== undefined) {
        headers.set(key, value);
      }
    }
  }
  let body: string | undefined;
  if (options.payload !== undefined) {
    body = typeof options.payload === "string" ? options.payload : JSON.stringify(options.payload);
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
  }
  const method = options.method.toUpperCase();
  const init: RequestInit = { method, headers };
  if (body !== undefined && method !== "GET" && method !== "HEAD") {
    init.body = body;
  }
  const response = await fetch(new URL(options.url, baseUrl), init);
  const text = await response.text();
  const headerMap: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headerMap[key] = value;
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) {
    headerMap["set-cookie"] = cookies.join("\n");
  }
  return {
    statusCode: response.status,
    headers: headerMap,
    body: text,
    json: <T = any>() => JSON.parse(text) as T,
  };
}

export function nextMessage(
  socket: WebSocket,
  timeoutMs = 1_000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for WebSocket message"));
    }, timeoutMs);
    const onMessage = (data: WebSocket.RawData) => {
      cleanup();
      resolve(JSON.parse(String(data)) as Record<string, unknown>);
    };
    const onClose = () => {
      cleanup();
      reject(new Error("WebSocket closed while waiting for message"));
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("message", onMessage);
      socket.off("close", onClose);
    };
    socket.once("message", onMessage);
    socket.once("close", onClose);
  });
}

export function waitForClose(
  socket: WebSocket,
  timeoutMs = 1_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for WebSocket close"));
    }, timeoutMs);
    const onClose = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("close", onClose);
    };
    socket.once("close", onClose);
  });
}

export async function waitUntil(
  predicate: () => boolean,
  timeoutMs = 500,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for condition");
}

export async function openSocket(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  return socket;
}

export async function openSocketListening(url: string): Promise<{
  socket: WebSocket;
  next: (timeoutMs?: number) => Promise<Record<string, unknown>>;
}> {
  const socket = new WebSocket(url);
  const queued: Record<string, unknown>[] = [];
  const waiters: Array<(message: Record<string, unknown>) => void> = [];
  socket.on("message", (data) => {
    const parsed = JSON.parse(String(data)) as Record<string, unknown>;
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
      return;
    }
    queued.push(parsed);
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  return {
    socket,
    next(timeoutMs = 1_000) {
      if (queued.length > 0) {
        return Promise.resolve(queued.shift() as Record<string, unknown>);
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error("Timed out waiting for WebSocket message"));
        }, timeoutMs);
        waiters.push((message) => {
          clearTimeout(timer);
          resolve(message);
        });
      });
    },
  };
}

export async function authenticateDeviceSocket(
  url: string,
  deviceId: string,
  credential: string,
  appVersion?: string,
): Promise<WebSocket> {
  const socket = await openSocket(url);
  socket.send(
    JSON.stringify({
      type: "auth",
      version: 1,
      device_id: deviceId,
      credential,
      ...(appVersion === undefined ? {} : { app_version: appVersion }),
    }),
  );
  const result = await nextMessage(socket);
  if (result.type !== "auth_result" || result.status !== "ok") {
    socket.close();
    throw new Error(`Authentication failed: ${JSON.stringify(result)}`);
  }
  return socket;
}

export const TEST_DEVICE_ID = "11111111-1111-4111-8111-111111111111";

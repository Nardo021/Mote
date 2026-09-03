import { createAppContext, type AppContext } from "../src/appContext.js";
import { buildApp } from "../src/app.js";
import { loadConfig, type EnvConfig } from "../src/config/env.js";
import {
  openMemoryDatabase,
  type MoteDatabase,
} from "../src/storage/database.js";
import type { FastifyInstance } from "fastify";
import { WebSocket } from "ws";

export type TestServer = {
  app: FastifyInstance;
  ctx: AppContext;
  db: MoteDatabase;
  port: number;
  baseUrl: string;
  wsUrl: string;
};

export function testConfig(overrides: Partial<EnvConfig> = {}): EnvConfig {
  return loadConfig({
    env: "test",
    host: "127.0.0.1",
    port: 0,
    databasePath: ":memory:",
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
  const app = await buildApp(ctx);
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("Failed to bind test server");
  }
  const port = address.port;
  return {
    app,
    ctx,
    db,
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}/v1/ws/device`,
  };
}

export async function stopTestServer(server: TestServer): Promise<void> {
  await server.app.close();
  server.db.close();
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

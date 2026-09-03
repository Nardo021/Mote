import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  DEFAULT_AUTH_TIMEOUT_MS,
  DEFAULT_COMMAND_TIMEOUT_MS,
  DEFAULT_COMMAND_TTL_MS,
  DEFAULT_HEARTBEAT_STALE_MS,
  DEFAULT_LAST_SEEN_PERSIST_MS,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_MAX_PENDING_COMMANDS,
  DEFAULT_PORT,
  DEFAULT_RATE_LIMIT_MAX,
  DEFAULT_RATE_LIMIT_WINDOW_MS,
  DEFAULT_STALE_SWEEP_INTERVAL_MS,
  PRODUCTION_PUBLIC_URL,
} from "./constants.js";

export type RuntimeEnv = "development" | "production" | "test";

export type EnvConfig = {
  env: RuntimeEnv;
  host: string;
  port: number;
  publicUrl: string;
  databasePath: string;
  logLevel: string;
  commandTtlMs: number;
  commandTimeoutMs: number;
  heartbeatStaleMs: number;
  authTimeoutMs: number;
  maxBodyBytes: number;
  lastSeenPersistMs: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  maxPendingCommands: number;
  staleSweepIntervalMs: number;
  dashboardDist: string;
};

function parseRuntimeEnv(value: string | undefined): RuntimeEnv {
  if (value === "production" || value === "test" || value === "development") {
    return value;
  }
  return "development";
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function defaultHost(env: RuntimeEnv): string {
  return env === "production" ? "0.0.0.0" : "127.0.0.1";
}

function defaultPublicUrl(env: RuntimeEnv): string {
  return env === "production" ? PRODUCTION_PUBLIC_URL : "http://127.0.0.1:3000";
}

function defaultDatabasePath(env: RuntimeEnv): string {
  if (env === "production") {
    return "/data/mote.sqlite";
  }
  return resolve("data/mote.sqlite");
}

function defaultDashboardDist(env: RuntimeEnv): string {
  if (env === "production") {
    return "/app/dashboard";
  }
  return resolve(process.cwd(), "../dashboard/dist");
}

export function loadDotEnvFile(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }
  const text = readFileSync(filePath, "utf8");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function loadLocalEnvFiles(): void {
  loadDotEnvFile(resolve(".env"));
}

export function loadConfig(overrides: Partial<EnvConfig> = {}): EnvConfig {
  const env = overrides.env ?? parseRuntimeEnv(process.env.MOTE_ENV);
  return {
    env,
    host: overrides.host ?? process.env.MOTE_HOST ?? defaultHost(env),
    port: overrides.port ?? parseInteger(process.env.MOTE_PORT, DEFAULT_PORT),
    publicUrl:
      overrides.publicUrl ??
      process.env.MOTE_PUBLIC_URL ??
      defaultPublicUrl(env),
    databasePath:
      overrides.databasePath ??
      process.env.MOTE_DATABASE_PATH ??
      defaultDatabasePath(env),
    logLevel:
      overrides.logLevel ??
      process.env.MOTE_LOG_LEVEL ??
      (env === "test" ? "silent" : "info"),
    commandTtlMs:
      overrides.commandTtlMs ??
      parseInteger(process.env.MOTE_COMMAND_TTL_MS, DEFAULT_COMMAND_TTL_MS),
    commandTimeoutMs:
      overrides.commandTimeoutMs ??
      parseInteger(
        process.env.MOTE_COMMAND_TIMEOUT_MS,
        DEFAULT_COMMAND_TIMEOUT_MS,
      ),
    heartbeatStaleMs:
      overrides.heartbeatStaleMs ??
      parseInteger(
        process.env.MOTE_HEARTBEAT_STALE_MS,
        DEFAULT_HEARTBEAT_STALE_MS,
      ),
    authTimeoutMs:
      overrides.authTimeoutMs ??
      parseInteger(process.env.MOTE_AUTH_TIMEOUT_MS, DEFAULT_AUTH_TIMEOUT_MS),
    maxBodyBytes:
      overrides.maxBodyBytes ??
      parseInteger(process.env.MOTE_MAX_BODY_BYTES, DEFAULT_MAX_BODY_BYTES),
    lastSeenPersistMs:
      overrides.lastSeenPersistMs ?? DEFAULT_LAST_SEEN_PERSIST_MS,
    rateLimitMax: overrides.rateLimitMax ?? DEFAULT_RATE_LIMIT_MAX,
    rateLimitWindowMs:
      overrides.rateLimitWindowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS,
    maxPendingCommands:
      overrides.maxPendingCommands ?? DEFAULT_MAX_PENDING_COMMANDS,
    staleSweepIntervalMs:
      overrides.staleSweepIntervalMs ?? DEFAULT_STALE_SWEEP_INTERVAL_MS,
    dashboardDist:
      overrides.dashboardDist ??
      process.env.MOTE_DASHBOARD_DIST ??
      defaultDashboardDist(env),
  };
}

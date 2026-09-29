import {
  DEFAULT_AUTH_TIMEOUT_MS,
  DEFAULT_COMMAND_TIMEOUT_MS,
  DEFAULT_COMMAND_TTL_MS,
  DEFAULT_HEARTBEAT_STALE_MS,
  DEFAULT_LAST_SEEN_PERSIST_MS,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_MAX_PENDING_COMMANDS,
  DEFAULT_PAIR_IP_RATE_LIMIT_MAX,
  DEFAULT_PAIR_IP_RATE_LIMIT_WINDOW_MS,
  DEFAULT_PAIR_RATE_LIMIT_MAX,
  DEFAULT_PAIR_RATE_LIMIT_WINDOW_MS,
  DEFAULT_PAIR_TTL_MS,
  DEFAULT_RATE_LIMIT_MAX,
  DEFAULT_RATE_LIMIT_WINDOW_MS,
  DEFAULT_STALE_SWEEP_INTERVAL_MS,
} from "./constants.js";

export type RuntimeEnv = "development" | "production" | "test";

export type EnvConfig = {
  env: RuntimeEnv;
  publicUrl: string;
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
  pairTtlMs: number;
  pairRateLimitMax: number;
  pairRateLimitWindowMs: number;
  pairIpRateLimitMax: number;
  pairIpRateLimitWindowMs: number;
  shortcutIcloudUrl: string | null;
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

function defaultPublicUrl(env: RuntimeEnv): string {
  // Worker passes an explicit public URL. Production must not dial a documentation hostname.
  return env === "production" ? "" : "http://127.0.0.1:8787";
}

export function loadConfig(overrides: Partial<EnvConfig> = {}): EnvConfig {
  const env = overrides.env ?? parseRuntimeEnv(process.env.MOTE_ENV);
  return {
    env,
    publicUrl:
      overrides.publicUrl ??
      process.env.MOTE_PUBLIC_URL ??
      defaultPublicUrl(env),
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
    pairTtlMs:
      overrides.pairTtlMs ??
      parseInteger(process.env.MOTE_PAIR_TTL_MS, DEFAULT_PAIR_TTL_MS),
    pairRateLimitMax:
      overrides.pairRateLimitMax ??
      parseInteger(
        process.env.MOTE_PAIR_RATE_LIMIT_MAX,
        DEFAULT_PAIR_RATE_LIMIT_MAX,
      ),
    pairRateLimitWindowMs:
      overrides.pairRateLimitWindowMs ??
      parseInteger(
        process.env.MOTE_PAIR_RATE_LIMIT_WINDOW_MS,
        DEFAULT_PAIR_RATE_LIMIT_WINDOW_MS,
      ),
    pairIpRateLimitMax:
      overrides.pairIpRateLimitMax ??
      parseInteger(
        process.env.MOTE_PAIR_IP_RATE_LIMIT_MAX,
        DEFAULT_PAIR_IP_RATE_LIMIT_MAX,
      ),
    pairIpRateLimitWindowMs:
      overrides.pairIpRateLimitWindowMs ??
      parseInteger(
        process.env.MOTE_PAIR_IP_RATE_LIMIT_WINDOW_MS,
        DEFAULT_PAIR_IP_RATE_LIMIT_WINDOW_MS,
      ),
    shortcutIcloudUrl:
      overrides.shortcutIcloudUrl ??
      optionalUrl(process.env.MOTE_SHORTCUT_ICLOUD_URL),
  };
}

function optionalUrl(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

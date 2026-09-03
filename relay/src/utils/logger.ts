import type { EnvConfig } from "../config/env.js";

export type LoggerConfig =
  | false
  | {
      level: string;
      redact: {
        paths: string[];
        censor: string;
      };
    };

export function loggerOptions(config: EnvConfig): LoggerConfig {
  if (config.env === "test" || config.logLevel === "silent") {
    return false;
  }
  return {
    level: config.logLevel,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "credential",
        "token",
        "token_hash",
        "credential_hash",
      ],
      censor: "[redacted]",
    },
  };
}

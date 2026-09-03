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
        "req.body.password",
        "req.body.current_password",
        "req.body.new_password",
        "credential",
        "token",
        "token_hash",
        "credential_hash",
        "password",
        "password_hash",
        "session_token",
      ],
      censor: "[redacted]",
    },
  };
}

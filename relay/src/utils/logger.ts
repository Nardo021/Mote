import type { EnvConfig } from "../config/env.js";

export type LoggerConfig =
  | false
  | {
      level: string;
      redact: {
        paths: string[];
        censor: string;
      };
      serializers: {
        req: (request: { method?: string; url?: string }) => {
          method: string;
          url: string;
        };
      };
    };

const REDACTED = "[redacted]";

const SECRET_QUERY_PATTERN = /([?&](?:pair_secret|token|credential|password)=)[^&#]*/gi;

export function redactRequestUrl(url: string): string {
  return url.replace(SECRET_QUERY_PATTERN, `$1${REDACTED}`);
}

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
        "req.body.pair_secret",
        "req.body.credential",
        "req.body.token",
        "req.query.pair_secret",
        "req.query.token",
        "req.query.credential",
        "credential",
        "token",
        "token_hash",
        "credential_hash",
        "password",
        "password_hash",
        "session_token",
        "pair_secret",
        "*.pair_secret",
        "*.credential",
        "*.token",
        "*.password",
      ],
      censor: REDACTED,
    },
    serializers: {
      req(request) {
        return {
          method: request.method ?? "GET",
          url: redactRequestUrl(request.url ?? ""),
        };
      },
    },
  };
}

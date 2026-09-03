import type { FastifyRequest } from "fastify";

import type { EnvConfig } from "../config/env.js";
import type { TokenRepository } from "../devices/tokenRepository.js";
import type { ApiTokenRecord } from "../devices/tokenTypes.js";
import { forbidden, unauthorized } from "../utils/errors.js";
import { Permission } from "./permissions.js";
import { hashSecret, verifySecret } from "./tokenHash.js";

export type AuthenticatedShortcut = {
  tokenId: string;
  name: string;
  permission: typeof Permission.send_command;
};

const lastUsedTouched = new Map<string, number>();

export function extractBearerToken(header: string | undefined): string | undefined {
  if (header === undefined) {
    return undefined;
  }
  const match = /^Bearer\s+(\S+)$/.exec(header);
  return match?.[1];
}

export function authenticateShortcutToken(
  authorizationHeader: string | undefined,
  tokens: TokenRepository,
): AuthenticatedShortcut {
  const secret = extractBearerToken(authorizationHeader);
  if (secret === undefined) {
    throw unauthorized();
  }
  const hashed = hashSecret(secret);
  const record = tokens.findByTokenHash(hashed);
  if (!record || !verifySecret(secret, record.tokenHash) || !record.enabled) {
    throw unauthorized();
  }
  if (record.permission !== Permission.send_command) {
    throw forbidden();
  }
  return {
    tokenId: record.id,
    name: record.name,
    permission: Permission.send_command,
  };
}

export function authenticateShortcutRequest(
  request: FastifyRequest,
  tokens: TokenRepository,
): AuthenticatedShortcut {
  const header = request.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  return authenticateShortcutToken(value, tokens);
}

export function maybeTouchTokenLastUsed(
  record: Pick<ApiTokenRecord, "id">,
  tokens: TokenRepository,
  config: Pick<EnvConfig, "lastSeenPersistMs">,
  now: number = Date.now(),
): void {
  const previous = lastUsedTouched.get(record.id) ?? 0;
  if (now - previous < config.lastSeenPersistMs) {
    return;
  }
  lastUsedTouched.set(record.id, now);
  tokens.updateLastUsed(record.id, now);
}

export function resetTokenTouchCache(): void {
  lastUsedTouched.clear();
}

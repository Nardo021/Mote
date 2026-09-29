import type { CommandSource } from "../commands/commandTypes.js";
import { CommandSource as CommandSources } from "../commands/commandTypes.js";
import type { EnvConfig } from "../config/env.js";
import type { TokenRepository } from "../devices/tokenRepository.js";
import type { ApiTokenRecord, CommandClientKind } from "../devices/tokenTypes.js";
import { forbidden, unauthorized } from "../utils/errors.js";
import { Permission } from "./permissions.js";
import { hashSecret, verifySecret } from "./tokenHash.js";

export type AuthenticatedShortcut = {
  tokenId: string;
  name: string;
  permission: typeof Permission.send_command;
  clientKind: CommandClientKind;
  deviceId: string;
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
  if (record.deviceId === null) {
    throw forbidden("This token is not scoped to a device.");
  }
  return {
    tokenId: record.id,
    name: record.name,
    permission: Permission.send_command,
    clientKind: record.clientKind,
    deviceId: record.deviceId,
  };
}

export function commandSourceForToken(_client: AuthenticatedShortcut): CommandSource {
  return CommandSources.shortcut;
}

export function assertTokenDeviceScope(client: AuthenticatedShortcut, deviceId: string): void {
  if (client.deviceId !== deviceId) {
    throw forbidden("This token cannot access that device.");
  }
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

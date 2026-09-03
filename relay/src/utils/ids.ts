import { randomBytes, randomUUID } from "node:crypto";

import { NONCE_BYTES, SECRET_BYTES } from "../config/constants.js";

export function createId(): string {
  return randomUUID();
}

export function createCommandId(): string {
  return `cmd_${randomUUID()}`;
}

export function createNonce(): string {
  return randomBytes(NONCE_BYTES).toString("base64url");
}

export function createSecret(): string {
  return randomBytes(SECRET_BYTES).toString("base64url");
}

export function createConnectionId(): string {
  return randomUUID();
}

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

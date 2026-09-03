import { randomBytes, timingSafeEqual } from "node:crypto";

import { argon2id } from "@noble/hashes/argon2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

const MEMORY_KIB = 19_456;
const TIME_COST = 2;
const PARALLELISM = 1;
const HASH_LENGTH = 32;
const SALT_LENGTH = 16;
const ENCODING_PREFIX = "argon2id";

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const hash = argon2id(utf8ToBytes(password), salt, {
    t: TIME_COST,
    m: MEMORY_KIB,
    p: PARALLELISM,
    dkLen: HASH_LENGTH,
  });
  return [
    ENCODING_PREFIX,
    String(MEMORY_KIB),
    String(TIME_COST),
    String(PARALLELISM),
    bytesToHex(salt),
    bytesToHex(hash),
  ].join("$");
}

export function verifyPassword(password: string, encoded: string): boolean {
  const parsed = parseEncodedHash(encoded);
  if (!parsed) {
    return false;
  }
  const actual = argon2id(utf8ToBytes(password), parsed.salt, {
    t: parsed.timeCost,
    m: parsed.memoryKib,
    p: parsed.parallelism,
    dkLen: parsed.expected.length,
  });
  const actualBuffer = Buffer.from(actual);
  if (actualBuffer.length !== parsed.expected.length) {
    return false;
  }
  return timingSafeEqual(actualBuffer, parsed.expected);
}

function parseEncodedHash(encoded: string):
  | {
      memoryKib: number;
      timeCost: number;
      parallelism: number;
      salt: Uint8Array;
      expected: Buffer;
    }
  | undefined {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== ENCODING_PREFIX) {
    return undefined;
  }
  const memoryKib = Number.parseInt(parts[1] ?? "", 10);
  const timeCost = Number.parseInt(parts[2] ?? "", 10);
  const parallelism = Number.parseInt(parts[3] ?? "", 10);
  const saltHex = parts[4];
  const hashHex = parts[5];
  if (
    !Number.isFinite(memoryKib) ||
    !Number.isFinite(timeCost) ||
    !Number.isFinite(parallelism) ||
    memoryKib <= 0 ||
    timeCost <= 0 ||
    parallelism <= 0 ||
    saltHex === undefined ||
    hashHex === undefined ||
    saltHex.length === 0 ||
    hashHex.length === 0
  ) {
    return undefined;
  }
  try {
    return {
      memoryKib,
      timeCost,
      parallelism,
      salt: hexToBytes(saltHex),
      expected: Buffer.from(hexToBytes(hashHex)),
    };
  } catch {
    return undefined;
  }
}

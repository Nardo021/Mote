import { createHash, timingSafeEqual } from "node:crypto";

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function verifySecret(secret: string, expectedHash: string): boolean {
  const actualHash = hashSecret(secret);
  const actual = Buffer.from(actualHash, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length === 0 || expected.length === 0 || actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

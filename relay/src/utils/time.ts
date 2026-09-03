export function nowMs(): number {
  return Date.now();
}

export function isExpired(expiresAt: number, now: number = nowMs()): boolean {
  return now > expiresAt;
}

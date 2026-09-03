const RETRYABLE = new Set(["failed", "timeout", "expired"]);

export function isRetryableStatus(status: string): boolean {
  return RETRYABLE.has(status);
}

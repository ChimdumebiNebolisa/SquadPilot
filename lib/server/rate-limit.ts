interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const requestBuckets = new Map<string, number[]>();

export function checkRateLimit(clientKey: string): RateLimitResult {
  const now = Date.now();
  const threshold = now - WINDOW_MS;
  const existing = requestBuckets.get(clientKey) ?? [];
  const active = existing.filter((timestamp) => timestamp >= threshold);

  if (active.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldest = active[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
    requestBuckets.set(clientKey, active);
    return {
      allowed: false,
      retryAfterSeconds,
    };
  }

  active.push(now);
  requestBuckets.set(clientKey, active);

  return {
    allowed: true,
    retryAfterSeconds: 0,
  };
}
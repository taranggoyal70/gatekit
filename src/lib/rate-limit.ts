type RateEntry = { count: number; resetAt: number };

const buckets = new Map<string, RateEntry>();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Best-effort in-memory limiter — fine for a single server instance, and
 * intentionally not backed by a shared store yet. If Gatekit scales to
 * multiple instances, swap this for Upstash/Redis without changing the
 * call sites (the signature is already keyed + windowed).
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);
  const entry: RateEntry =
    !existing || existing.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : existing;
  entry.count += 1;
  buckets.set(key, entry);

  if (buckets.size > 50_000) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }

  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
  };
}

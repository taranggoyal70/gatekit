import { sql } from "drizzle-orm";

import { rateLimits } from "@/db/schema";
import type { Database } from "@/lib/services/types";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Fixed-window limiter backed by Postgres, so every server instance shares
 * one count per key. A single atomic upsert either starts a new window or
 * increments the current one; the database clock decides which, so instances
 * with skewed clocks still agree.
 *
 * It costs one round trip per call, on the same database the evaluate path
 * already writes to, which is cheaper than adding a second store to operate.
 */
export async function checkRateLimit(
  database: Database,
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const windowSeconds = windowMs / 1000;
  const expired = sql`${rateLimits.windowStart} <= now() - make_interval(secs => ${windowSeconds})`;

  const [row] = await database
    .insert(rateLimits)
    .values({ key, windowStart: sql`now()`, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${expired} THEN 1 ELSE ${rateLimits.count} + 1 END`,
        windowStart: sql`CASE WHEN ${expired} THEN now() ELSE ${rateLimits.windowStart} END`,
      },
    })
    .returning({
      count: rateLimits.count,
      secondsLeft: sql<string>`extract(epoch from (${rateLimits.windowStart} + make_interval(secs => ${windowSeconds}) - now()))`,
    });
  if (!row) throw new Error("Rate limit upsert returned no row.");

  return {
    allowed: row.count <= limit,
    remaining: Math.max(0, limit - row.count),
    retryAfterSeconds: Math.max(1, Math.ceil(Number(row.secondsLeft))),
  };
}

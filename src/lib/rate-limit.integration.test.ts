import { beforeEach, describe, expect, it } from "vitest";

import { checkRateLimit } from "@/lib/rate-limit";
import { testDb, truncateAll } from "@/lib/services/test-db";

const database = testDb();

describe("checkRateLimit (integration)", () => {
  beforeEach(async () => {
    await truncateAll(database);
  });

  it("allows requests under the limit", async () => {
    const result = await checkRateLimit(database, "k", 5, 60_000);
    expect(result).toMatchObject({ allowed: true, remaining: 4 });
    expect(result.retryAfterSeconds).toBeGreaterThan(55);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("blocks once the limit is exceeded", async () => {
    let last;
    for (let i = 0; i < 5; i += 1) last = await checkRateLimit(database, "k", 5, 60_000);
    expect(last?.allowed).toBe(true);
    const sixth = await checkRateLimit(database, "k", 5, 60_000);
    expect(sixth).toMatchObject({ allowed: false, remaining: 0 });
  });

  it("tracks keys independently", async () => {
    for (let i = 0; i < 5; i += 1) await checkRateLimit(database, "a", 5, 60_000);
    expect((await checkRateLimit(database, "b", 5, 60_000)).allowed).toBe(true);
  });

  it("starts a new window once the old one has passed", async () => {
    for (let i = 0; i < 3; i += 1) await checkRateLimit(database, "k", 3, 50);
    expect((await checkRateLimit(database, "k", 3, 50)).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(await checkRateLimit(database, "k", 3, 50)).toMatchObject({ allowed: true, remaining: 2 });
  });

  it("counts every concurrent request exactly once", async () => {
    // On Postgres this exercises the upsert under contention; PGlite
    // serializes the calls, so there it only checks the arithmetic.
    const results = await Promise.all(
      Array.from({ length: 30 }, () => checkRateLimit(database, "burst", 20, 60_000)),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(20);
    expect(results.filter((r) => !r.allowed)).toHaveLength(10);
  });
});

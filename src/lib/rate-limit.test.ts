import { describe, expect, it } from "vitest";

import { checkRateLimit } from "./rate-limit";

describe("checkRateLimit", () => {
  it("allows requests under the limit", () => {
    const key = `test-${Math.random()}`;
    const result = checkRateLimit(key, 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("blocks requests once the limit is exceeded", () => {
    const key = `test-${Math.random()}`;
    let last;
    for (let i = 0; i < 5; i += 1) last = checkRateLimit(key, 5, 60_000);
    expect(last?.allowed).toBe(true);
    const sixth = checkRateLimit(key, 5, 60_000);
    expect(sixth.allowed).toBe(false);
    expect(sixth.remaining).toBe(0);
  });

  it("tracks separate keys independently", () => {
    const keyA = `test-a-${Math.random()}`;
    const keyB = `test-b-${Math.random()}`;
    for (let i = 0; i < 5; i += 1) checkRateLimit(keyA, 5, 60_000);
    const resultB = checkRateLimit(keyB, 5, 60_000);
    expect(resultB.allowed).toBe(true);
  });

  it("resets the window after it expires", async () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i += 1) checkRateLimit(key, 3, 20);
    const blocked = checkRateLimit(key, 3, 20);
    expect(blocked.allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const afterReset = checkRateLimit(key, 3, 20);
    expect(afterReset.allowed).toBe(true);
  });
});

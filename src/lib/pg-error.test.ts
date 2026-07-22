import { describe, expect, it } from "vitest";

import { pgErrorCode } from "./pg-error";

describe("pgErrorCode", () => {
  it("reads a code directly on the error", () => {
    expect(pgErrorCode({ code: "23505" })).toBe("23505");
  });

  it("reads a code nested one level deep via cause", () => {
    const inner = { code: "23505", message: "duplicate key" };
    const outer = new Error("Failed query", { cause: inner });
    expect(pgErrorCode(outer)).toBe("23505");
  });

  it("reads a code nested multiple levels deep via cause chains", () => {
    const innermost = { code: "23505" };
    const middle = new Error("wrapped once", { cause: innermost });
    const outer = new Error("wrapped twice", { cause: middle });
    expect(pgErrorCode(outer)).toBe("23505");
  });

  it("returns undefined when no code is found anywhere in the chain", () => {
    expect(pgErrorCode(new Error("plain error"))).toBeUndefined();
  });

  it("returns undefined for non-object, non-error values", () => {
    expect(pgErrorCode("just a string")).toBeUndefined();
    expect(pgErrorCode(null)).toBeUndefined();
    expect(pgErrorCode(undefined)).toBeUndefined();
  });

  it("does not loop forever on a self-referential cause", () => {
    const err = new Error("circular");
    err.cause = err;
    expect(pgErrorCode(err)).toBeUndefined();
  });
});

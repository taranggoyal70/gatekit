import { describe, expect, it } from "vitest";

import { getPlanLimits } from "./plan-limits";

describe("getPlanLimits", () => {
  it("returns free-tier limits for 'free'", () => {
    expect(getPlanLimits("free")).toEqual({
      maxAgents: 20,
      maxMembers: 10,
      monthlyActionLimit: 1_000,
    });
  });

  it("returns higher limits for 'pro'", () => {
    const limits = getPlanLimits("pro");
    expect(limits.maxAgents).toBeGreaterThan(getPlanLimits("free").maxAgents);
    expect(limits.maxMembers).toBeGreaterThan(getPlanLimits("free").maxMembers);
  });

  it("returns unbounded limits for 'enterprise'", () => {
    const limits = getPlanLimits("enterprise");
    expect(limits.maxAgents).toBe(Number.POSITIVE_INFINITY);
    expect(limits.maxMembers).toBe(Number.POSITIVE_INFINITY);
  });

  it("falls back to free-tier limits for an unknown plan value", () => {
    expect(getPlanLimits("not-a-real-plan")).toEqual(getPlanLimits("free"));
  });

  it("falls back to free-tier limits for an empty string", () => {
    expect(getPlanLimits("")).toEqual(getPlanLimits("free"));
  });

  it("documents that Infinity serializes to null over JSON — API responses must treat null, not Infinity, as 'unlimited' on the client", () => {
    const limits = getPlanLimits("enterprise");
    const roundTripped = JSON.parse(JSON.stringify(limits));
    expect(roundTripped.maxAgents).toBeNull();
    expect(roundTripped.maxMembers).toBeNull();
  });
});

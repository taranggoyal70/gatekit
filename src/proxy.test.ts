import { describe, expect, it } from "vitest";

import { isProtectedApiPathname, isProtectedPagePathname } from "./proxy";

describe("isProtectedPagePathname", () => {
  it("protects dashboard pages", () => {
    expect(isProtectedPagePathname("/dashboard")).toBe(true);
    expect(isProtectedPagePathname("/settings")).toBe(true);
    expect(isProtectedPagePathname("/invite/abc123")).toBe(true);
  });

  it("does not protect the public marketing pages", () => {
    expect(isProtectedPagePathname("/")).toBe(false);
    expect(isProtectedPagePathname("/docs")).toBe(false);
    expect(isProtectedPagePathname("/sign-in")).toBe(false);
  });
});

describe("isProtectedApiPathname", () => {
  it("protects dashboard-facing API routes", () => {
    expect(isProtectedApiPathname("/api/agents")).toBe(true);
    expect(isProtectedApiPathname("/api/team/members")).toBe(true);
    expect(isProtectedApiPathname("/api/billing/checkout")).toBe(true);
    expect(isProtectedApiPathname("/api/billing/status")).toBe(true);
    expect(isProtectedApiPathname("/api/settings/notifications")).toBe(true);
    expect(isProtectedApiPathname("/api/settings/notifications/test")).toBe(true);
    expect(isProtectedApiPathname("/api/audit/verify")).toBe(true);
    expect(isProtectedApiPathname("/api/audit/events")).toBe(true);
  });

  it("does NOT protect the Stripe webhook — Stripe has no Clerk session", () => {
    expect(isProtectedApiPathname("/api/billing/webhook")).toBe(false);
  });

  it("publishes only the checkpoint public key from /api/audit", () => {
    expect(isProtectedApiPathname("/api/audit/public-key")).toBe(false);
    expect(isProtectedApiPathname("/api/audit/public-key/x")).toBe(true);
  });

  it("does not protect the SDK-facing v1 API (uses agent-key auth instead)", () => {
    expect(isProtectedApiPathname("/api/v1/evaluate")).toBe(false);
    expect(isProtectedApiPathname("/api/v1/actions/abc")).toBe(false);
  });

  it("does not protect health or invite acceptance", () => {
    expect(isProtectedApiPathname("/api/health")).toBe(false);
  });
});

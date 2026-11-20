import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("sendApprovalRequestEmail", () => {
  const originalKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.RESEND_API_KEY;
  });

  afterEach(() => {
    if (originalKey) process.env.RESEND_API_KEY = originalKey;
  });

  it("is a no-op when a key is set but no sender is, since Resend would reject any default", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    delete process.env.GATEKIT_NOTIFICATION_FROM;
    const { sendInviteEmail } = await import("./notifications");
    await expect(
      sendInviteEmail("Acme", { email: "a@b.example", token: "t", invitedByEmail: "c@d.example" }),
    ).resolves.toBeUndefined();
    delete process.env.RESEND_API_KEY;
  });

  it("is a no-op and never throws when RESEND_API_KEY is not configured", async () => {
    const { sendApprovalRequestEmail } = await import("./notifications");

    await expect(
      sendApprovalRequestEmail("org_1", {
        id: "action_1",
        orgId: "org_1",
        agentId: "agent_1",
        actionType: "email.send",
        target: "x@y.com",
        riskLevel: "high",
        decision: "require_approval",
        matchedPolicyId: null,
        status: "pending",
        context: null,
        createdAt: new Date(),
        resolvedAt: null,
      }),
    ).resolves.toBeUndefined();
  });
});

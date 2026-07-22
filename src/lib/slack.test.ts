import { afterEach, describe, expect, it, vi } from "vitest";

import { sendSlackApprovalNotification, sendSlackTestMessage } from "./slack";

const sampleAction = {
  id: "action_1",
  orgId: "org_1",
  agentId: "agent_1",
  actionType: "payment.refund",
  target: "cust_123",
  riskLevel: "high" as const,
  decision: "require_approval" as const,
  matchedPolicyId: null,
  status: "pending" as const,
  context: null,
  createdAt: new Date(),
  resolvedAt: null,
};

describe("sendSlackApprovalNotification", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to the webhook URL with action details", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendSlackApprovalNotification(
      "https://hooks.slack.com/services/T00/B00/xxx",
      sampleAction,
      "https://gatekit.dev",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://hooks.slack.com/services/T00/B00/xxx");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.text).toContain("payment.refund");
    expect(body.text).toContain("cust_123");
  });

  it("never throws when the webhook request fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendSlackApprovalNotification("https://hooks.slack.com/services/T00/B00/xxx", sampleAction, "https://gatekit.dev"),
    ).resolves.toBeUndefined();
  });

  it("never throws when Slack responds with a non-OK status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendSlackApprovalNotification("https://hooks.slack.com/services/T00/B00/xxx", sampleAction, "https://gatekit.dev"),
    ).resolves.toBeUndefined();
  });
});

describe("sendSlackTestMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves when Slack accepts the message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    await expect(
      sendSlackTestMessage("https://hooks.slack.com/services/T00/B00/xxx"),
    ).resolves.toBeUndefined();
  });

  it("throws when Slack rejects the message — the caller needs to know", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(
      sendSlackTestMessage("https://hooks.slack.com/services/T00/B00/xxx"),
    ).rejects.toThrow(/404/);
  });

  it("propagates a network failure as a thrown error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(
      sendSlackTestMessage("https://hooks.slack.com/services/T00/B00/xxx"),
    ).rejects.toThrow("network down");
  });
});

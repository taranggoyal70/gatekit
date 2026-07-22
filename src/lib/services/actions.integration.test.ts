import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { organizations } from "@/db/schema";
import { createAgent } from "@/lib/services/agents";
import {
  evaluateAndRecordAction,
  expirePastDueApprovals,
  getActionStatus,
  listActions,
} from "@/lib/services/actions";
import {
  decideApproval,
  listPendingApprovals,
} from "@/lib/services/approvals";
import { createPolicy } from "@/lib/services/policies";
import { testDb, truncateAll } from "@/lib/services/test-db";

const database = testDb();
const describeIfDb = database ? describe : describe.skip;

describeIfDb("action evaluation + approval flow (integration)", () => {
  let orgId: string;
  let agentId: string;

  beforeEach(async () => {
    if (!database) return;
    await truncateAll(database);
    const [org] = await database
      .insert(organizations)
      .values({ name: "Test Org", slug: `test-org-${Date.now()}-${Math.random()}` })
      .returning();
    orgId = org!.id;
    const { agent } = await createAgent(database, orgId, { name: "test-agent" });
    agentId = agent.id;
  });

  it("records a resolved action when no policy matches a low-risk request", async () => {
    const { action, approval } = await evaluateAndRecordAction(database!, orgId, agentId, {
      actionType: "email.send",
      target: "user@company.com",
      riskLevel: "low",
    });

    expect(action.status).toBe("resolved");
    expect(action.decision).toBe("allow");
    expect(approval).toBeNull();
  });

  it("holds a high-risk action for approval by default with no matching policy", async () => {
    const { action, approval } = await evaluateAndRecordAction(database!, orgId, agentId, {
      actionType: "payment.refund",
      target: "cust_123",
      riskLevel: "high",
    });

    expect(action.status).toBe("pending");
    expect(action.decision).toBe("require_approval");
    expect(approval).not.toBeNull();
    expect(approval?.status).toBe("pending");
  });

  it("denies an action matched by an explicit deny policy", async () => {
    await createPolicy(database!, orgId, {
      name: "block competitor emails",
      actionTypePattern: "email.send",
      targetPattern: "*@competitor.com",
      minRiskLevel: "low",
      decision: "deny",
      priority: 10,
      enabled: true,
    });

    const { action } = await evaluateAndRecordAction(database!, orgId, agentId, {
      actionType: "email.send",
      target: "someone@competitor.com",
      riskLevel: "low",
    });

    expect(action.decision).toBe("deny");
    expect(action.status).toBe("resolved");
    expect(action.matchedPolicyId).not.toBeNull();
  });

  it("round-trips through getActionStatus for a pending action", async () => {
    const { action } = await evaluateAndRecordAction(database!, orgId, agentId, {
      actionType: "payment.refund",
      target: "cust_123",
      riskLevel: "critical",
    });

    const status = await getActionStatus(database!, orgId, action.id);
    expect(status.action.id).toBe(action.id);
    expect(status.approval?.status).toBe("pending");
  });

  it("approves a pending action end-to-end and resolves both rows", async () => {
    const { action, approval } = await evaluateAndRecordAction(database!, orgId, agentId, {
      actionType: "payment.refund",
      target: "cust_123",
      riskLevel: "high",
    });

    const { approval: decided, action: resolvedAction } = await decideApproval(
      database!,
      orgId,
      approval!.id,
      "user_approver",
      { decision: "approved" },
    );

    expect(decided?.status).toBe("approved");
    expect(decided?.decidedBy).toBe("user_approver");
    expect(resolvedAction?.status).toBe("approved");
    expect(resolvedAction?.resolvedAt).not.toBeNull();

    const refetched = await getActionStatus(database!, orgId, action.id);
    expect(refetched.action.status).toBe("approved");
  });

  it("denies a pending action and records the reason", async () => {
    const { approval } = await evaluateAndRecordAction(database!, orgId, agentId, {
      actionType: "payment.refund",
      target: "cust_123",
      riskLevel: "high",
    });

    const { approval: decided } = await decideApproval(
      database!,
      orgId,
      approval!.id,
      "user_approver",
      { decision: "denied", reason: "looks fraudulent" },
    );

    expect(decided?.status).toBe("denied");
    expect(decided?.reason).toBe("looks fraudulent");
  });

  it("rejects deciding an approval twice", async () => {
    const { approval } = await evaluateAndRecordAction(database!, orgId, agentId, {
      actionType: "payment.refund",
      target: "cust_123",
      riskLevel: "high",
    });

    await decideApproval(database!, orgId, approval!.id, "user_a", { decision: "approved" });

    await expect(
      decideApproval(database!, orgId, approval!.id, "user_b", { decision: "denied" }),
    ).rejects.toThrow(/already been resolved/);
  });

  it("lists only pending approvals for the org", async () => {
    const first = await evaluateAndRecordAction(database!, orgId, agentId, {
      actionType: "payment.refund",
      target: "cust_1",
      riskLevel: "high",
    });
    await evaluateAndRecordAction(database!, orgId, agentId, {
      actionType: "payment.refund",
      target: "cust_2",
      riskLevel: "high",
    });
    await decideApproval(database!, orgId, first.approval!.id, "user_a", {
      decision: "approved",
    });

    const pending = await listPendingApprovals(database!, orgId);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.action.target).toBe("cust_2");
  });

  it("expires a pending approval past its window and updates the action", async () => {
    const { action, approval } = await evaluateAndRecordAction(database!, orgId, agentId, {
      actionType: "payment.refund",
      target: "cust_123",
      riskLevel: "high",
    });

    // Force the approval into the past to simulate an elapsed window.
    await database!.execute(
      sql`update approvals set expires_at = now() - interval '1 hour' where id = ${approval!.id}`,
    );

    await expirePastDueApprovals(database!, orgId);

    const status = await getActionStatus(database!, orgId, action.id);
    expect(status.action.status).toBe("expired");
    expect(status.approval?.status).toBe("expired");
  });

  it("filters the audit log by status", async () => {
    await evaluateAndRecordAction(database!, orgId, agentId, {
      actionType: "email.send",
      target: "user@company.com",
      riskLevel: "low",
    });
    await evaluateAndRecordAction(database!, orgId, agentId, {
      actionType: "payment.refund",
      target: "cust_123",
      riskLevel: "high",
    });

    const resolvedOnly = await listActions(database!, orgId, { status: "resolved" });
    const pendingOnly = await listActions(database!, orgId, { status: "pending" });

    expect(resolvedOnly).toHaveLength(1);
    expect(pendingOnly).toHaveLength(1);
    expect(resolvedOnly[0]?.actionType).toBe("email.send");
    expect(pendingOnly[0]?.actionType).toBe("payment.refund");
  });
});

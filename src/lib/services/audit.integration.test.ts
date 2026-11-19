import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { actions, approvals, auditEvents, organizations } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { evaluateAndRecordAction, expirePastDueApprovals } from "@/lib/services/actions";
import { createAgent } from "@/lib/services/agents";
import { decideApproval } from "@/lib/services/approvals";
import { appendAuditEvent, listAuditEvents, verifyOrgAudit } from "@/lib/services/audit";
import { createPolicy, deletePolicy, updatePolicy } from "@/lib/services/policies";
import { testDb, truncateAll } from "@/lib/services/test-db";

const database = testDb();

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the promise to reject.");
}

describe("audit chain (integration)", () => {
  let orgId: string;
  let agentId: string;

  beforeEach(async () => {
    await truncateAll(database);
    const [org] = await database
      .insert(organizations)
      .values({ name: "Audit Org", slug: `audit-${Date.now()}-${Math.random()}` })
      .returning();
    orgId = org!.id;
    agentId = (await createAgent(database, orgId, { name: "audited-agent" })).agent.id;
  });

  it("records every governance event in one verifiable chain", async () => {
    const policy = await createPolicy(
      database,
      orgId,
      {
        name: "hold refunds",
        actionTypePattern: "payment.refund",
        targetPattern: "*",
        minRiskLevel: "low",
        decision: "require_approval",
        priority: 10,
        enabled: true,
      },
      "user:owner",
    );
    const allowed = await evaluateAndRecordAction(database, orgId, agentId, {
      actionType: "email.send",
      target: "a@b.com",
      riskLevel: "low",
      context: { subject: "hi", nested: { b: 2, a: 1 } },
    });
    const held = await evaluateAndRecordAction(database, orgId, agentId, {
      actionType: "payment.refund",
      target: "cust_1",
      riskLevel: "medium",
    });
    await decideApproval(database, orgId, held.approval!.id, "user_reviewer", {
      decision: "approved",
      reason: "ok",
    });
    await updatePolicy(database, orgId, policy.id, { enabled: false }, "user:owner");
    await deletePolicy(database, orgId, policy.id, "user:owner");

    const events = await listAuditEvents(database, orgId);
    expect(events.map((event) => event.eventType)).toEqual([
      "policy.created",
      "action.evaluated",
      "action.evaluated",
      "approval.decided",
      "policy.updated",
      "policy.deleted",
    ]);
    expect(events.map((event) => event.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(events[1]).toMatchObject({ actionId: allowed.action.id, actor: `agent:${agentId}` });
    expect(events[1]!.payload.contextSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(events[2]!.payload.policy).toMatchObject({ id: policy.id, name: "hold refunds" });
    expect(events[3]).toMatchObject({ actor: "user:user_reviewer", actionId: held.action.id });

    const result = await verifyOrgAudit(database, orgId);
    expect(result.ok).toBe(true);
    expect(result.chain).toMatchObject({ checked: 6, headSeq: 6, headHash: events[5]!.hash });
    expect(result.actions.checked).toBe(2);
  });

  it("keeps the matched policy in the record after the policy is deleted", async () => {
    const policy = await createPolicy(database, orgId, {
      name: "deny prod drops",
      actionTypePattern: "db.drop",
      targetPattern: "prod.*",
      minRiskLevel: "low",
      decision: "deny",
      priority: 1,
      enabled: true,
    });
    const { action } = await evaluateAndRecordAction(database, orgId, agentId, {
      actionType: "db.drop",
      target: "prod.users",
      riskLevel: "low",
    });
    await deletePolicy(database, orgId, policy.id);

    const [row] = await database.select().from(actions).where(eq(actions.id, action.id));
    expect(row!.matchedPolicyId).toBeNull();
    const [evaluated] = (await listAuditEvents(database, orgId)).filter(
      (event) => event.actionId === action.id,
    );
    expect(evaluated!.payload.policy).toMatchObject({ name: "deny prod drops", targetPattern: "prod.*" });
    expect((await verifyOrgAudit(database, orgId)).ok).toBe(true);
  });

  it("records lazy approval expiry as a system event", async () => {
    const held = await evaluateAndRecordAction(database, orgId, agentId, {
      actionType: "payment.refund",
      target: "cust_1",
      riskLevel: "high",
    });
    await database
      .update(approvals)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(approvals.id, held.approval!.id));
    await expirePastDueApprovals(database, orgId);

    const events = await listAuditEvents(database, orgId);
    expect(events.at(-1)).toMatchObject({ eventType: "approval.expired", actor: "system" });
    expect((await verifyOrgAudit(database, orgId)).ok).toBe(true);
  });

  it("refuses to decide an approval whose window has passed", async () => {
    const held = await evaluateAndRecordAction(database, orgId, agentId, {
      actionType: "payment.refund",
      target: "cust_1",
      riskLevel: "high",
    });
    await database
      .update(approvals)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(approvals.id, held.approval!.id));

    const error = await errorOf(
      decideApproval(database, orgId, held.approval!.id, "user_late", { decision: "approved" }),
    );
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).status).toBe(409);
  });

  it("lets exactly one of two concurrent reviewers decide an approval", async () => {
    const held = await evaluateAndRecordAction(database, orgId, agentId, {
      actionType: "payment.refund",
      target: "cust_1",
      riskLevel: "high",
    });
    const outcomes = await Promise.allSettled([
      decideApproval(database, orgId, held.approval!.id, "user_a", { decision: "approved" }),
      decideApproval(database, orgId, held.approval!.id, "user_b", { decision: "denied" }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({ status: 409 });

    const decided = (await listAuditEvents(database, orgId)).filter(
      (event) => event.eventType === "approval.decided",
    );
    expect(decided).toHaveLength(1);
    expect((await verifyOrgAudit(database, orgId)).ok).toBe(true);
  });

  it("assigns contiguous sequence numbers under concurrent evaluations", async () => {
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        evaluateAndRecordAction(database, orgId, agentId, {
          actionType: "email.send",
          target: `user${index}@example.com`,
          riskLevel: "low",
        }),
      ),
    );
    const events = await listAuditEvents(database, orgId);
    expect(events.map((event) => event.seq)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect((await verifyOrgAudit(database, orgId)).ok).toBe(true);
  });

  it("keeps separate chains per organization", async () => {
    const [other] = await database
      .insert(organizations)
      .values({ name: "Other", slug: `other-${Date.now()}` })
      .returning();
    const otherAgent = (await createAgent(database, other!.id, { name: "x" })).agent.id;
    await evaluateAndRecordAction(database, orgId, agentId, { actionType: "a", target: "b", riskLevel: "low" });
    await evaluateAndRecordAction(database, other!.id, otherAgent, { actionType: "a", target: "b", riskLevel: "low" });

    const mine = await listAuditEvents(database, orgId);
    const theirs = await listAuditEvents(database, other!.id);
    expect(mine.map((event) => event.seq)).toEqual([1]);
    expect(theirs.map((event) => event.seq)).toEqual([1]);
  });

  it("rejects UPDATE and DELETE on audit_events at the database", async () => {
    await evaluateAndRecordAction(database, orgId, agentId, { actionType: "a", target: "b", riskLevel: "low" });

    await expect(
      database.update(auditEvents).set({ actor: "someone-else" }).where(eq(auditEvents.orgId, orgId)),
    ).rejects.toThrow();
    await expect(database.delete(auditEvents).where(eq(auditEvents.orgId, orgId))).rejects.toThrow();
    expect(await listAuditEvents(database, orgId)).toHaveLength(1);
  });

  it("still lets an organization be deleted, cascading its audit events", async () => {
    await evaluateAndRecordAction(database, orgId, agentId, { actionType: "a", target: "b", riskLevel: "low" });
    await database.delete(organizations).where(eq(organizations.id, orgId));
    expect(await listAuditEvents(database, orgId)).toHaveLength(0);
  });

  it("flags an actions row edited behind the audit log's back", async () => {
    const { action } = await evaluateAndRecordAction(database, orgId, agentId, {
      actionType: "db.drop",
      target: "prod.users",
      riskLevel: "critical",
    });
    // A direct SQL edit that makes a held action look allowed and resolved.
    await database
      .update(actions)
      .set({ decision: "allow", status: "resolved" })
      .where(eq(actions.id, action.id));

    const result = await verifyOrgAudit(database, orgId);
    expect(result.ok).toBe(false);
    expect(result.chain.ok).toBe(true);
    expect(result.actions.failures.map((failure) => failure.kind)).toEqual(
      expect.arrayContaining(["decision_mismatch", "status_mismatch"]),
    );
  });

  it("flags an action inserted without going through evaluation", async () => {
    await database.insert(actions).values({
      orgId,
      agentId,
      actionType: "payment.refund",
      target: "cust_9",
      decision: "allow",
    });
    const result = await verifyOrgAudit(database, orgId);
    expect(result.actions.failures).toEqual([
      expect.objectContaining({ kind: "missing_evaluation_event" }),
    ]);
  });

  it("detects a rewritten event even when the trigger is bypassed", async () => {
    for (const target of ["a", "b", "c"]) {
      await evaluateAndRecordAction(database, orgId, agentId, { actionType: "x", target, riskLevel: "low" });
    }
    const before = await verifyOrgAudit(database, orgId);
    await database.execute(sql`ALTER TABLE audit_events DISABLE TRIGGER audit_events_append_only`);
    try {
      await database.execute(
        sql`UPDATE audit_events SET payload = jsonb_set(payload, '{decision}', '"deny"') WHERE org_id = ${orgId} AND seq = 2`,
      );
    } finally {
      await database.execute(sql`ALTER TABLE audit_events ENABLE TRIGGER audit_events_append_only`);
    }
    const after = await verifyOrgAudit(database, orgId, {
      seq: before.chain.headSeq,
      hash: before.chain.headHash,
    });
    expect(after.ok).toBe(false);
    expect(after.chain.failures).toContainEqual(expect.objectContaining({ seq: 2, kind: "hash_mismatch" }));
  });

  it("rejects a duplicate sequence number even if a caller skips the lock", async () => {
    await database.transaction(async (tx) => {
      await appendAuditEvent(tx, orgId, { eventType: "policy.created", actor: "system", payload: {} });
    });
    const [first] = await listAuditEvents(database, orgId);
    await expect(
      database.insert(auditEvents).values({
        orgId,
        seq: 1,
        eventType: "policy.created",
        actor: "system",
        payload: {},
        prevHash: first!.prevHash,
        hash: first!.hash.replace(/^./, first!.hash[0] === "a" ? "b" : "a"),
        createdAt: new Date(),
      }),
    ).rejects.toThrow();
  });
});

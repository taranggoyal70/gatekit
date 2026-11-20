import "server-only";

import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";

import { actions, approvals } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { expirePastDueApprovals } from "@/lib/services/actions";
import { appendAuditEvent } from "@/lib/services/audit";
import type { Database } from "@/lib/services/types";

export const approvalDecisionSchema = z.object({
  decision: z.enum(["approved", "denied"]),
  reason: z.string().max(1000).optional(),
});

export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;

export async function listPendingApprovals(database: Database, orgId: string) {
  await expirePastDueApprovals(database, orgId);
  return database
    .select({ approval: approvals, action: actions })
    .from(approvals)
    .innerJoin(actions, eq(approvals.actionId, actions.id))
    .where(and(eq(approvals.orgId, orgId), eq(approvals.status, "pending")))
    .orderBy(desc(approvals.createdAt));
}

export async function decideApproval(
  database: Database,
  orgId: string,
  approvalId: string,
  decidedBy: string,
  input: ApprovalDecisionInput,
) {
  await expirePastDueApprovals(database, orgId);

  return database.transaction(async (tx) => {
    const now = new Date();
    // Conditional update: only a still-pending approval can be decided. Two
    // reviewers clicking at once both pass a read-then-write check; only one
    // of them can match `status = 'pending'` here.
    const [updatedApproval] = await tx
      .update(approvals)
      .set({
        status: input.decision,
        decidedBy,
        decidedAt: now,
        reason: input.reason ?? null,
      })
      .where(
        and(
          eq(approvals.id, approvalId),
          eq(approvals.orgId, orgId),
          eq(approvals.status, "pending"),
          gt(approvals.expiresAt, now),
        ),
      )
      .returning();

    if (!updatedApproval) {
      const [existing] = await tx
        .select({ status: approvals.status })
        .from(approvals)
        .where(and(eq(approvals.id, approvalId), eq(approvals.orgId, orgId)))
        .limit(1);
      if (!existing) throw new AppError("Approval not found.", 404, "not_found");
      if (existing.status === "pending") {
        // Past its window but not reaped yet; the next read records the expiry.
        throw new AppError("This approval expired before it was decided.", 409, "expired");
      }
      throw new AppError(
        `This approval has already been resolved (${existing.status}).`,
        409,
        "already_resolved",
      );
    }

    const [updatedAction] = await tx
      .update(actions)
      .set({ status: input.decision, resolvedAt: now })
      .where(eq(actions.id, updatedApproval.actionId))
      .returning();

    await appendAuditEvent(tx, orgId, {
      eventType: "approval.decided",
      actionId: updatedApproval.actionId,
      actor: `user:${decidedBy}`,
      payload: {
        approvalId: updatedApproval.id,
        decision: input.decision,
        reason: input.reason ?? null,
      },
    });

    return { approval: updatedApproval, action: updatedAction };
  });
}

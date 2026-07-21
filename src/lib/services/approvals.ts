import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { actions, approvals } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { expirePastDueApprovals } from "@/lib/services/actions";
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

  const [approval] = await database
    .select()
    .from(approvals)
    .where(and(eq(approvals.id, approvalId), eq(approvals.orgId, orgId)))
    .limit(1);
  if (!approval) throw new AppError("Approval not found.", 404, "not_found");
  if (approval.status !== "pending") {
    throw new AppError(
      `This approval has already been resolved (${approval.status}).`,
      409,
      "already_resolved",
    );
  }

  const now = new Date();
  const [updatedApproval] = await database
    .update(approvals)
    .set({
      status: input.decision,
      decidedBy,
      decidedAt: now,
      reason: input.reason ?? null,
    })
    .where(eq(approvals.id, approvalId))
    .returning();

  const [updatedAction] = await database
    .update(actions)
    .set({ status: input.decision, resolvedAt: now })
    .where(eq(actions.id, approval.actionId))
    .returning();

  return { approval: updatedApproval, action: updatedAction };
}

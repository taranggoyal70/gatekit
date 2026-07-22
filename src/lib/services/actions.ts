import "server-only";

import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";

import { actions, approvals, policies } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { sendApprovalRequestEmail } from "@/lib/notifications";
import { evaluateAction, type RiskLevel } from "@/lib/policy-engine";
import { getNotificationSettings } from "@/lib/services/notification-settings";
import { toPolicyRule } from "@/lib/services/policies";
import type { Database } from "@/lib/services/types";
import { sendSlackApprovalNotification } from "@/lib/slack";

export const evaluateInputSchema = z.object({
  actionType: z.string().min(1).max(200),
  target: z.string().min(1).max(500),
  riskLevel: z.enum(["low", "medium", "high", "critical"]).default("low"),
  context: z.record(z.string(), z.unknown()).optional(),
});

export type EvaluateInput = z.infer<typeof evaluateInputSchema>;

const APPROVAL_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function evaluateAndRecordAction(
  database: Database,
  orgId: string,
  agentId: string,
  input: EvaluateInput,
) {
  const orgPolicies = await database
    .select()
    .from(policies)
    .where(eq(policies.orgId, orgId));

  const result = evaluateAction(
    {
      actionType: input.actionType,
      target: input.target,
      riskLevel: input.riskLevel as RiskLevel,
    },
    orgPolicies.map(toPolicyRule),
  );

  const status = result.decision === "require_approval" ? "pending" : "resolved";

  const [action] = await database
    .insert(actions)
    .values({
      orgId,
      agentId,
      actionType: input.actionType,
      target: input.target,
      riskLevel: input.riskLevel,
      decision: result.decision,
      matchedPolicyId: result.matchedPolicy?.id ?? null,
      status,
      context: input.context ?? null,
      resolvedAt: status === "resolved" ? new Date() : null,
    })
    .returning();

  if (!action) throw new AppError("Failed to record action.", 500, "internal_error");

  if (result.decision !== "require_approval") {
    return { action, approval: null, reason: result.reason };
  }

  const [approval] = await database
    .insert(approvals)
    .values({
      actionId: action.id,
      orgId,
      expiresAt: new Date(Date.now() + APPROVAL_WINDOW_MS),
    })
    .returning();

  await sendApprovalRequestEmail(orgId, action).catch((error) =>
    console.error("Failed to send approval notification", error),
  );

  const notificationSettings = await getNotificationSettings(database, orgId).catch(() => null);
  if (notificationSettings?.slackWebhookUrl) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    await sendSlackApprovalNotification(notificationSettings.slackWebhookUrl, action, siteUrl);
  }

  return { action, approval, reason: result.reason };
}

export async function getActionStatus(database: Database, orgId: string, actionId: string) {
  const [action] = await database
    .select()
    .from(actions)
    .where(and(eq(actions.id, actionId), eq(actions.orgId, orgId)))
    .limit(1);
  if (!action) throw new AppError("Action not found.", 404, "not_found");

  const [approval] = await database
    .select()
    .from(approvals)
    .where(eq(approvals.actionId, actionId))
    .limit(1);

  return { action, approval: approval ?? null };
}

export type ActionListFilters = {
  status?: string;
  agentId?: string;
  limit?: number;
  cursor?: string;
};

export async function listActions(
  database: Database,
  orgId: string,
  filters: ActionListFilters,
) {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const conditions = [eq(actions.orgId, orgId)];
  if (filters.status) conditions.push(eq(actions.status, filters.status as never));
  if (filters.agentId) conditions.push(eq(actions.agentId, filters.agentId));
  if (filters.cursor) conditions.push(lt(actions.createdAt, new Date(filters.cursor)));

  return database
    .select()
    .from(actions)
    .where(and(...conditions))
    .orderBy(desc(actions.createdAt))
    .limit(limit);
}

/** Expired pending approvals are lazily reaped on read rather than via a cron
 * job — simpler ops story for the MVP, and correctness only depends on
 * checking expiry before treating an approval as actionable. */
export async function expirePastDueApprovals(database: Database, orgId: string) {
  const now = new Date();
  const expired = await database
    .update(approvals)
    .set({ status: "expired" })
    .where(
      and(
        eq(approvals.orgId, orgId),
        eq(approvals.status, "pending"),
        lt(approvals.expiresAt, now),
      ),
    )
    .returning({ actionId: approvals.actionId });

  if (expired.length === 0) return;

  for (const { actionId } of expired) {
    await database
      .update(actions)
      .set({ status: "expired", resolvedAt: now })
      .where(eq(actions.id, actionId));
  }
}

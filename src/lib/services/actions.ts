import "server-only";

import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";

import { actions, approvals, policies } from "@/db/schema";
import { canonicalJson, sha256Hex } from "@/lib/audit-chain";
import { AppError } from "@/lib/errors";
import { sendApprovalRequestEmail } from "@/lib/notifications";
import { evaluateAction, type RiskLevel } from "@/lib/policy-engine";
import { appendAuditEvent } from "@/lib/services/audit";
import { getNotificationSettings } from "@/lib/services/notification-settings";
import { toPolicyRule } from "@/lib/services/policies";
import type { Database } from "@/lib/services/types";
import { sendSlackApprovalNotification } from "@/lib/slack";

// Control characters (NUL in particular, which Postgres text rejects) would
// otherwise surface as a 500 from the insert; reject them as bad input.
const NO_CONTROL_CHARS = /^\P{Cc}*$/u;

export const evaluateInputSchema = z.object({
  actionType: z.string().trim().min(1).max(200).regex(NO_CONTROL_CHARS, "Must not contain control characters."),
  target: z.string().min(1).max(500).regex(NO_CONTROL_CHARS, "Must not contain control characters."),
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
  const matched = result.matchedPolicy;

  // The action row, its approval and its audit event commit together or not
  // at all: an action that exists without an audit record (or the reverse)
  // would make the log unverifiable.
  const { action, approval } = await database.transaction(async (tx) => {
    const [action] = await tx
      .insert(actions)
      .values({
        orgId,
        agentId,
        actionType: input.actionType,
        target: input.target,
        riskLevel: input.riskLevel,
        decision: result.decision,
        matchedPolicyId: matched?.id ?? null,
        status,
        context: input.context ?? null,
        resolvedAt: status === "resolved" ? new Date() : null,
      })
      .returning();
    if (!action) throw new AppError("Failed to record action.", 500, "internal_error");

    let approval: typeof approvals.$inferSelect | null = null;
    if (result.decision === "require_approval") {
      [approval] = (await tx
        .insert(approvals)
        .values({
          actionId: action.id,
          orgId,
          expiresAt: new Date(Date.now() + APPROVAL_WINDOW_MS),
        })
        .returning()) as [typeof approvals.$inferSelect];
    }

    await appendAuditEvent(tx, orgId, {
      eventType: "action.evaluated",
      actionId: action.id,
      actor: `agent:${agentId}`,
      payload: {
        agentId,
        actionType: action.actionType,
        target: action.target,
        riskLevel: action.riskLevel,
        decision: action.decision,
        reason: result.reason,
        // A snapshot, not a reference: policies can be edited or deleted
        // later, and the record must still say what rule made this call.
        policy: matched
          ? {
              id: matched.id,
              name: matched.name,
              priority: matched.priority,
              actionTypePattern: matched.actionTypePattern,
              targetPattern: matched.targetPattern,
              minRiskLevel: matched.minRiskLevel,
              decision: matched.decision,
            }
          : null,
        contextSha256: input.context ? sha256Hex(canonicalJson(input.context)) : null,
        approvalId: approval?.id ?? null,
        approvalExpiresAt: approval?.expiresAt.toISOString() ?? null,
      },
    });

    return { action, approval };
  });

  if (!approval) {
    return { action, approval: null, reason: result.reason };
  }

  // Notifications run after commit and never fail the evaluation.
  await sendApprovalRequestEmail(orgId, action).catch((error) =>
    console.error("Failed to send approval notification", error),
  );

  const notificationSettings = await getNotificationSettings(database, orgId).catch(() => null);
  if (notificationSettings?.slackWebhookUrl) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    await sendSlackApprovalNotification(notificationSettings.slackWebhookUrl, action, siteUrl).catch(
      (error) => console.error("Failed to send Slack approval notification", error),
    );
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

export const ACTION_STATUSES = ["resolved", "pending", "approved", "denied", "expired"] as const;

export const actionListFiltersSchema = z.object({
  status: z.enum(ACTION_STATUSES).optional(),
  agentId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.iso.datetime({ offset: true }).optional(),
});

export type ActionListFilters = z.infer<typeof actionListFiltersSchema>;

export async function listActions(
  database: Database,
  orgId: string,
  filters: ActionListFilters,
) {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const conditions = [eq(actions.orgId, orgId)];
  if (filters.status) conditions.push(eq(actions.status, filters.status));
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
 * job: simpler to operate, and correctness only depends on checking expiry
 * before treating an approval as actionable. Each expiry is recorded in the
 * audit chain in the same transaction that marks it. */
export async function expirePastDueApprovals(database: Database, orgId: string) {
  const now = new Date();
  await database.transaction(async (tx) => {
    const expired = await tx
      .update(approvals)
      .set({ status: "expired" })
      .where(
        and(
          eq(approvals.orgId, orgId),
          eq(approvals.status, "pending"),
          lt(approvals.expiresAt, now),
        ),
      )
      .returning({ id: approvals.id, actionId: approvals.actionId, expiresAt: approvals.expiresAt });

    for (const approval of expired) {
      await tx
        .update(actions)
        .set({ status: "expired", resolvedAt: now })
        .where(eq(actions.id, approval.actionId));
      await appendAuditEvent(tx, orgId, {
        eventType: "approval.expired",
        actionId: approval.actionId,
        actor: "system",
        payload: { approvalId: approval.id, expiresAt: approval.expiresAt.toISOString() },
      });
    }
  });
}

import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { policies } from "@/db/schema";
import { AppError } from "@/lib/errors";
import type { PolicyRule } from "@/lib/policy-engine";
import { appendAuditEvent } from "@/lib/services/audit";
import type { Database } from "@/lib/services/types";

export const policyInputSchema = z.object({
  name: z.string().min(1).max(120),
  actionTypePattern: z.string().min(1).max(200),
  targetPattern: z.string().min(1).max(200).default("*"),
  minRiskLevel: z.enum(["low", "medium", "high", "critical"]).default("low"),
  decision: z.enum(["allow", "deny", "require_approval"]),
  priority: z.number().int().min(0).max(100_000).default(100),
  enabled: z.boolean().default(true),
});

export type PolicyInput = z.infer<typeof policyInputSchema>;

/**
 * PATCH body: every field optional and, unlike `policyInputSchema.partial()`,
 * with no defaults. In zod 4 `.partial()` still applies `.default()`, so a
 * body of `{ "enabled": false }` used to come back with targetPattern "*",
 * minRiskLevel "low" and priority 100, silently widening the policy every
 * time the dashboard toggled it.
 */
export const policyPatchSchema = z
  .object({
    name: z.string().min(1).max(120),
    actionTypePattern: z.string().min(1).max(200),
    targetPattern: z.string().min(1).max(200),
    minRiskLevel: z.enum(["low", "medium", "high", "critical"]),
    decision: z.enum(["allow", "deny", "require_approval"]),
    priority: z.number().int().min(0).max(100_000),
    enabled: z.boolean(),
  })
  .partial()
  .strict();

export type PolicyPatch = z.infer<typeof policyPatchSchema>;

function snapshot(row: typeof policies.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    actionTypePattern: row.actionTypePattern,
    targetPattern: row.targetPattern,
    minRiskLevel: row.minRiskLevel,
    decision: row.decision,
    priority: row.priority,
    enabled: row.enabled,
  };
}

export async function listPolicies(database: Database, orgId: string) {
  return database
    .select()
    .from(policies)
    .where(eq(policies.orgId, orgId))
    .orderBy(asc(policies.priority));
}

/**
 * Policy changes are governance events too: each one is recorded in the
 * audit chain with before/after snapshots, in the same transaction.
 * `actor` is "user:<clerk id>" from the API routes.
 */
export async function createPolicy(
  database: Database,
  orgId: string,
  input: PolicyInput,
  actor = "system",
) {
  return database.transaction(async (tx) => {
    const [policy] = await tx
      .insert(policies)
      .values({ orgId, ...input })
      .returning();
    if (!policy) throw new AppError("Failed to create policy.", 500, "internal_error");
    await appendAuditEvent(tx, orgId, {
      eventType: "policy.created",
      actor,
      payload: { after: snapshot(policy) },
    });
    return policy;
  });
}

export async function updatePolicy(
  database: Database,
  orgId: string,
  policyId: string,
  input: PolicyPatch,
  actor = "system",
) {
  return database.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(policies)
      .where(and(eq(policies.id, policyId), eq(policies.orgId, orgId)))
      .limit(1);
    if (!existing) throw new AppError("Policy not found.", 404, "not_found");

    const [updated] = await tx
      .update(policies)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(policies.id, policyId))
      .returning();
    if (!updated) throw new AppError("Policy not found.", 404, "not_found");
    await appendAuditEvent(tx, orgId, {
      eventType: "policy.updated",
      actor,
      payload: { before: snapshot(existing), after: snapshot(updated) },
    });
    return updated;
  });
}

export async function deletePolicy(
  database: Database,
  orgId: string,
  policyId: string,
  actor = "system",
) {
  await database.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(policies)
      .where(and(eq(policies.id, policyId), eq(policies.orgId, orgId)))
      .returning();
    if (!deleted) throw new AppError("Policy not found.", 404, "not_found");
    await appendAuditEvent(tx, orgId, {
      eventType: "policy.deleted",
      actor,
      payload: { before: snapshot(deleted) },
    });
  });
}

export function toPolicyRule(row: typeof policies.$inferSelect): PolicyRule {
  return {
    id: row.id,
    name: row.name,
    actionTypePattern: row.actionTypePattern,
    targetPattern: row.targetPattern,
    minRiskLevel: row.minRiskLevel,
    decision: row.decision,
    priority: row.priority,
    enabled: row.enabled,
  };
}

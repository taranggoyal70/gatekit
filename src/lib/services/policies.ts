import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { policies } from "@/db/schema";
import { AppError } from "@/lib/errors";
import type { PolicyRule } from "@/lib/policy-engine";
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

export async function listPolicies(database: Database, orgId: string) {
  return database
    .select()
    .from(policies)
    .where(eq(policies.orgId, orgId))
    .orderBy(asc(policies.priority));
}

export async function createPolicy(
  database: Database,
  orgId: string,
  input: PolicyInput,
) {
  const [policy] = await database
    .insert(policies)
    .values({ orgId, ...input })
    .returning();
  if (!policy) throw new AppError("Failed to create policy.", 500, "internal_error");
  return policy;
}

export async function updatePolicy(
  database: Database,
  orgId: string,
  policyId: string,
  input: Partial<PolicyInput>,
) {
  const [existing] = await database
    .select()
    .from(policies)
    .where(and(eq(policies.id, policyId), eq(policies.orgId, orgId)))
    .limit(1);
  if (!existing) throw new AppError("Policy not found.", 404, "not_found");

  const [updated] = await database
    .update(policies)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(policies.id, policyId))
    .returning();
  return updated;
}

export async function deletePolicy(database: Database, orgId: string, policyId: string) {
  const [existing] = await database
    .select({ id: policies.id })
    .from(policies)
    .where(and(eq(policies.id, policyId), eq(policies.orgId, orgId)))
    .limit(1);
  if (!existing) throw new AppError("Policy not found.", 404, "not_found");
  await database.delete(policies).where(eq(policies.id, policyId));
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

export type PlanTier = "free" | "pro" | "enterprise";

export type PlanLimits = {
  maxAgents: number;
  maxMembers: number;
  monthlyActionLimit: number;
};

const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: { maxAgents: 20, maxMembers: 10, monthlyActionLimit: 1_000 },
  pro: { maxAgents: 100, maxMembers: 50, monthlyActionLimit: 50_000 },
  enterprise: {
    maxAgents: Number.POSITIVE_INFINITY,
    maxMembers: Number.POSITIVE_INFINITY,
    monthlyActionLimit: Number.POSITIVE_INFINITY,
  },
};

/** Falls back to the free tier for any value that isn't a known plan —
 * covers a null/corrupt planTier column rather than throwing mid-request. */
export function getPlanLimits(planTier: string): PlanLimits {
  return PLAN_LIMITS[planTier as PlanTier] ?? PLAN_LIMITS.free;
}

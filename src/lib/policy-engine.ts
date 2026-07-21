/**
 * The policy engine is Gatekit's core IP: given an action an agent wants to
 * take and the org's configured policies, decide whether it may proceed
 * immediately, must be blocked, or must wait for a human to approve it.
 *
 * Design choices (see docs/adr for the reasoning):
 * - First-match-wins over priority (ascending — lower number = evaluated
 *   first), not "most specific wins" or "most restrictive wins". Explicit
 *   ordering is easier for an org's security team to audit than an implicit
 *   specificity heuristic.
 * - Risk thresholds are a floor, not an exact match: a policy with
 *   minRiskLevel "high" also matches "critical" actions, because a rule
 *   written to catch risky behavior should not need a duplicate for every
 *   higher risk tier.
 * - Absent any matching policy, the safe default only holds high/critical
 *   risk actions for approval; low/medium pass through. This keeps
 *   time-to-first-value low (nothing needs configuring to try Gatekit) while
 *   still gating the actions an org would actually worry about.
 */

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type Decision = "allow" | "deny" | "require_approval";

const RISK_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export function isRiskAtLeast(
  actual: RiskLevel,
  threshold: RiskLevel,
): boolean {
  return RISK_ORDER[actual] >= RISK_ORDER[threshold];
}

export type ActionRequest = {
  actionType: string;
  target: string;
  riskLevel: RiskLevel;
};

export type PolicyRule = {
  id: string;
  name: string;
  actionTypePattern: string;
  targetPattern: string;
  minRiskLevel: RiskLevel;
  decision: Decision;
  priority: number;
  enabled: boolean;
};

export type EvaluationResult = {
  decision: Decision;
  matchedPolicy: PolicyRule | null;
  reason: string;
};

/**
 * Compile a glob-style pattern ("*" = any run of characters, everything
 * else literal) into an anchored matcher. Patterns are user-authored policy
 * config, not regex — a bare "." or "+" must be treated literally or a
 * policy like "billing.charge" would accidentally match "billingXcharge".
 */
function compilePattern(pattern: string): RegExp {
  const escaped = pattern
    .split("*")
    .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`);
}

function matches(pattern: string, value: string): boolean {
  return compilePattern(pattern).test(value);
}

/**
 * Deterministic ordering for policy evaluation: priority ascending, then
 * policy id ascending as a stable tie-break. Without the tie-break, two
 * policies sharing a priority would match in whatever order the caller's
 * array happened to be in — silently non-deterministic and unauditable.
 */
function sortPolicies(policies: PolicyRule[]): PolicyRule[] {
  return [...policies].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

const DEFAULT_HOLD_THRESHOLD: RiskLevel = "high";

export function evaluateAction(
  request: ActionRequest,
  policies: PolicyRule[],
): EvaluationResult {
  const candidates = sortPolicies(policies.filter((policy) => policy.enabled));

  for (const policy of candidates) {
    const actionTypeMatches = matches(
      policy.actionTypePattern,
      request.actionType,
    );
    if (!actionTypeMatches) continue;

    const targetMatches = matches(policy.targetPattern, request.target);
    if (!targetMatches) continue;

    const riskMatches = isRiskAtLeast(request.riskLevel, policy.minRiskLevel);
    if (!riskMatches) continue;

    return {
      decision: policy.decision,
      matchedPolicy: policy,
      reason: `Matched policy "${policy.name}" (priority ${policy.priority}).`,
    };
  }

  if (isRiskAtLeast(request.riskLevel, DEFAULT_HOLD_THRESHOLD)) {
    return {
      decision: "require_approval",
      matchedPolicy: null,
      reason: `No policy matched; default hold applies because risk level "${request.riskLevel}" is at or above "${DEFAULT_HOLD_THRESHOLD}".`,
    };
  }

  return {
    decision: "allow",
    matchedPolicy: null,
    reason: `No policy matched; risk level "${request.riskLevel}" is below the default hold threshold, so the action is allowed.`,
  };
}

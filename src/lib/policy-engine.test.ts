import { describe, expect, it } from "vitest";

import {
  evaluateAction,
  isRiskAtLeast,
  type PolicyRule,
} from "./policy-engine";

function policy(overrides: Partial<PolicyRule> & Pick<PolicyRule, "id">): PolicyRule {
  return {
    name: overrides.id,
    actionTypePattern: "*",
    targetPattern: "*",
    minRiskLevel: "low",
    decision: "allow",
    priority: 100,
    enabled: true,
    ...overrides,
  };
}

describe("isRiskAtLeast", () => {
  it("treats equal levels as satisfying the threshold", () => {
    expect(isRiskAtLeast("high", "high")).toBe(true);
  });

  it("treats a higher actual level as satisfying a lower threshold", () => {
    expect(isRiskAtLeast("critical", "high")).toBe(true);
  });

  it("treats a lower actual level as not satisfying a higher threshold", () => {
    expect(isRiskAtLeast("low", "high")).toBe(false);
  });
});

describe("evaluateAction — pattern matching", () => {
  it("matches an exact action type and target", () => {
    const result = evaluateAction(
      { actionType: "email.send", target: "user@company.com", riskLevel: "low" },
      [
        policy({
          id: "p1",
          actionTypePattern: "email.send",
          targetPattern: "user@company.com",
          decision: "deny",
        }),
      ],
    );
    expect(result.decision).toBe("deny");
    expect(result.matchedPolicy?.id).toBe("p1");
  });

  it("matches a wildcard action type against any action", () => {
    const result = evaluateAction(
      { actionType: "anything.at.all", target: "x", riskLevel: "low" },
      [policy({ id: "p1", actionTypePattern: "*", decision: "deny" })],
    );
    expect(result.decision).toBe("deny");
  });

  it("matches a prefix wildcard like email.*", () => {
    const result = evaluateAction(
      { actionType: "email.send", target: "x", riskLevel: "low" },
      [policy({ id: "p1", actionTypePattern: "email.*", decision: "deny" })],
    );
    expect(result.decision).toBe("deny");
  });

  it("does not match a prefix wildcard against an unrelated action type", () => {
    const result = evaluateAction(
      { actionType: "sms.send", target: "x", riskLevel: "low" },
      [policy({ id: "p1", actionTypePattern: "email.*", decision: "deny" })],
    );
    expect(result.decision).toBe("allow");
    expect(result.matchedPolicy).toBeNull();
  });

  it("matches a suffix wildcard on the target, like *@external.com", () => {
    const result = evaluateAction(
      {
        actionType: "email.send",
        target: "someone@external.com",
        riskLevel: "low",
      },
      [
        policy({
          id: "p1",
          targetPattern: "*@external.com",
          decision: "require_approval",
        }),
      ],
    );
    expect(result.decision).toBe("require_approval");
  });

  it("does not match a suffix wildcard against a different domain", () => {
    const result = evaluateAction(
      {
        actionType: "email.send",
        target: "someone@internal.com",
        riskLevel: "low",
      },
      [
        policy({
          id: "p1",
          targetPattern: "*@external.com",
          decision: "require_approval",
        }),
      ],
    );
    expect(result.decision).toBe("allow");
  });

  it("treats literal regex-special characters in patterns as literal, not regex", () => {
    // A pattern of "billing.charge" must not accidentally match
    // "billingXcharge" by treating "." as "any character".
    const result = evaluateAction(
      { actionType: "billingXcharge", target: "x", riskLevel: "low" },
      [
        policy({
          id: "p1",
          actionTypePattern: "billing.charge",
          decision: "deny",
        }),
      ],
    );
    expect(result.decision).toBe("allow");
    expect(result.matchedPolicy).toBeNull();
  });
});

describe("evaluateAction — risk thresholds", () => {
  it("does not apply a policy when the action's risk is below the policy's minimum", () => {
    const result = evaluateAction(
      { actionType: "payment.refund", target: "x", riskLevel: "low" },
      [
        policy({
          id: "p1",
          actionTypePattern: "payment.*",
          minRiskLevel: "high",
          decision: "require_approval",
        }),
      ],
    );
    expect(result.decision).toBe("allow");
    expect(result.matchedPolicy).toBeNull();
  });

  it("applies a policy when the action's risk exceeds the policy's minimum", () => {
    const result = evaluateAction(
      { actionType: "payment.refund", target: "x", riskLevel: "critical" },
      [
        policy({
          id: "p1",
          actionTypePattern: "payment.*",
          minRiskLevel: "high",
          decision: "require_approval",
        }),
      ],
    );
    expect(result.decision).toBe("require_approval");
    expect(result.matchedPolicy?.id).toBe("p1");
  });

  it("applies a policy when the action's risk exactly equals the policy's minimum", () => {
    const result = evaluateAction(
      { actionType: "payment.refund", target: "x", riskLevel: "high" },
      [
        policy({
          id: "p1",
          actionTypePattern: "payment.*",
          minRiskLevel: "high",
          decision: "require_approval",
        }),
      ],
    );
    expect(result.decision).toBe("require_approval");
  });
});

describe("evaluateAction — priority and disabled policies", () => {
  it("picks the lower-priority-number policy when two policies both match", () => {
    const result = evaluateAction(
      { actionType: "email.send", target: "x", riskLevel: "low" },
      [
        policy({ id: "p-low-priority", priority: 50, decision: "deny" }),
        policy({ id: "p-high-priority", priority: 10, decision: "allow" }),
      ],
    );
    expect(result.matchedPolicy?.id).toBe("p-high-priority");
    expect(result.decision).toBe("allow");
  });

  it("breaks a priority tie deterministically by policy id", () => {
    const resultA = evaluateAction(
      { actionType: "email.send", target: "x", riskLevel: "low" },
      [
        policy({ id: "zzz", priority: 10, decision: "deny" }),
        policy({ id: "aaa", priority: 10, decision: "allow" }),
      ],
    );
    const resultB = evaluateAction(
      { actionType: "email.send", target: "x", riskLevel: "low" },
      [
        policy({ id: "aaa", priority: 10, decision: "allow" }),
        policy({ id: "zzz", priority: 10, decision: "deny" }),
      ],
    );
    // Same input set, different array order — must resolve to the same
    // policy both times, or two orgs with identically configured policies
    // could see different enforcement depending on incidental array order.
    expect(resultA.matchedPolicy?.id).toBe("aaa");
    expect(resultB.matchedPolicy?.id).toBe("aaa");
  });

  it("skips a disabled policy even if it would otherwise match first", () => {
    const result = evaluateAction(
      { actionType: "email.send", target: "x", riskLevel: "low" },
      [
        policy({
          id: "p-disabled",
          priority: 1,
          enabled: false,
          decision: "deny",
        }),
        policy({ id: "p-enabled", priority: 50, decision: "allow" }),
      ],
    );
    expect(result.matchedPolicy?.id).toBe("p-enabled");
    expect(result.decision).toBe("allow");
  });

  it("stops at the first match and does not consider later policies", () => {
    const result = evaluateAction(
      { actionType: "email.send", target: "x", riskLevel: "low" },
      [
        policy({ id: "p1", priority: 1, decision: "deny" }),
        policy({ id: "p2", priority: 2, decision: "allow" }),
      ],
    );
    expect(result.decision).toBe("deny");
    expect(result.matchedPolicy?.id).toBe("p1");
  });
});

describe("evaluateAction — default behavior with no matching policy", () => {
  it("allows a low-risk action with no policies at all", () => {
    const result = evaluateAction(
      { actionType: "anything", target: "x", riskLevel: "low" },
      [],
    );
    expect(result.decision).toBe("allow");
    expect(result.matchedPolicy).toBeNull();
  });

  it("allows a medium-risk action with no matching policy", () => {
    const result = evaluateAction(
      { actionType: "anything", target: "x", riskLevel: "medium" },
      [],
    );
    expect(result.decision).toBe("allow");
  });

  it("holds a high-risk action for approval with no matching policy", () => {
    const result = evaluateAction(
      { actionType: "anything", target: "x", riskLevel: "high" },
      [],
    );
    expect(result.decision).toBe("require_approval");
    expect(result.matchedPolicy).toBeNull();
  });

  it("holds a critical-risk action for approval with no matching policy", () => {
    const result = evaluateAction(
      { actionType: "anything", target: "x", riskLevel: "critical" },
      [],
    );
    expect(result.decision).toBe("require_approval");
  });

  it("falls through to the default when policies exist but none match", () => {
    const result = evaluateAction(
      { actionType: "sms.send", target: "x", riskLevel: "critical" },
      [policy({ id: "p1", actionTypePattern: "email.*", decision: "deny" })],
    );
    expect(result.decision).toBe("require_approval");
    expect(result.matchedPolicy).toBeNull();
  });
});

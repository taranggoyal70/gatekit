export type RiskLevel = "low" | "medium" | "high" | "critical";
export type Decision = "allow" | "deny" | "require_approval";
export type ActionStatus =
  | "resolved"
  | "pending"
  | "approved"
  | "denied"
  | "expired";

export type EvaluateInput = {
  actionType: string;
  target: string;
  riskLevel?: RiskLevel;
  context?: Record<string, unknown>;
};

export type EvaluateResult = {
  actionId: string;
  decision: Decision;
  status: ActionStatus;
  reason: string;
  approvalId: string | null;
  expiresAt: string | null;
};

export type ActionStatusResult = {
  actionId: string;
  decision: Decision;
  status: ActionStatus;
  approval: { id: string; status: string; reason: string | null } | null;
};

export type GatekitClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
};

export type WaitForApprovalOptions = {
  timeoutMs?: number;
  pollIntervalMs?: number;
};

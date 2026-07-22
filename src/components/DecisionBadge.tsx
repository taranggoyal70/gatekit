const DECISION_STYLES: Record<string, string> = {
  allow: "bg-[var(--ok)]/10 text-[var(--ok)]",
  deny: "bg-[var(--danger)]/10 text-[var(--danger)]",
  require_approval: "bg-[var(--warn)]/10 text-[var(--warn)]",
};

const STATUS_LABELS: Record<string, string> = {
  resolved: "",
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
  expired: "Expired",
};

export function DecisionBadge({
  decision,
  status,
}: {
  decision: string;
  status: string;
}) {
  const label =
    status !== "resolved" ? (STATUS_LABELS[status] ?? status) : decision.replace("_", " ");
  const colorKey = status === "pending" ? "require_approval" : decision;

  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
        DECISION_STYLES[colorKey] ?? "bg-[var(--line)] text-[var(--foreground)]/60"
      }`}
    >
      {label}
    </span>
  );
}

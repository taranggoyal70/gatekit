"use client";

import { useCallback, useEffect, useState } from "react";

import { DecisionBadge } from "@/components/DecisionBadge";

type ActionRow = {
  id: string;
  actionType: string;
  target: string;
  riskLevel: string;
  decision: string;
  status: string;
  createdAt: string;
};

const STATUS_FILTERS = ["all", "resolved", "pending", "approved", "denied", "expired"];

export function AuditLog() {
  const [actions, setActions] = useState<ActionRow[] | null>(null);
  const [status, setStatus] = useState("all");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (statusFilter: string) => {
    try {
      const params = statusFilter === "all" ? "" : `?status=${statusFilter}`;
      const res = await fetch(`/api/actions${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setActions(data.actions);
    } catch {
      setError("Failed to load the audit log.");
    }
  }, []);

  useEffect(() => {
    setActions(null);
    load(status);
  }, [status, load]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-4 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter}
            onClick={() => setStatus(filter)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${
              status === filter
                ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                : "text-[var(--foreground)]/50 hover:text-[var(--foreground)]"
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {actions === null ? (
        <div className="h-64 animate-pulse rounded-xl border border-[var(--line)]" />
      ) : actions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] p-8 text-center text-sm text-[var(--foreground)]/60">
          No actions match this filter yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--line)]">
          {actions.map((action) => (
            <div
              key={action.id}
              className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-4 py-3 last:border-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{action.actionType}</p>
                <p className="truncate text-xs text-[var(--foreground)]/50">{action.target}</p>
                <p className="mt-0.5 text-xs text-[var(--foreground)]/40 sm:hidden">
                  {action.riskLevel} risk · {new Date(action.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="hidden text-xs uppercase tracking-wide text-[var(--foreground)]/40 sm:inline">
                  {action.riskLevel}
                </span>
                <DecisionBadge decision={action.decision} status={action.status} />
                <span className="hidden w-36 text-right text-xs text-[var(--foreground)]/40 sm:inline">
                  {new Date(action.createdAt).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

type PendingRow = {
  approval: { id: string; expiresAt: string; createdAt: string };
  action: {
    id: string;
    actionType: string;
    target: string;
    riskLevel: string;
    context: Record<string, unknown> | null;
  };
};

const RISK_TONE: Record<string, string> = {
  low: "text-[var(--foreground)]/50",
  medium: "text-[var(--warn)]",
  high: "text-[var(--danger)]",
  critical: "text-[var(--danger)]",
};

export function ApprovalsQueue() {
  const [rows, setRows] = useState<PendingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/approvals");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRows(data.pending);
    } catch {
      setError("Failed to load pending approvals.");
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5_000);
    return () => clearInterval(interval);
  }, [load]);

  async function decide(approvalId: string, decision: "approved" | "denied") {
    setDecidingId(approvalId);
    setError(null);
    try {
      const res = await fetch(`/api/approvals/${approvalId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason: reasonDrafts[approvalId] || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? "Failed to record decision.");
      }
      setRows((prev) => prev?.filter((r) => r.approval.id !== approvalId) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record decision.");
    } finally {
      setDecidingId(null);
    }
  }

  if (rows === null) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-[var(--line)]" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-4 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] p-8 text-center text-sm text-[var(--foreground)]/60">
          Nothing waiting on you right now.
        </div>
      ) : (
        rows.map(({ approval, action }) => (
          <div key={approval.id} className="rounded-xl border border-[var(--line)] p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium">{action.actionType}</p>
                <p className="mt-0.5 truncate text-sm text-[var(--foreground)]/60">{action.target}</p>
                <p className={`mt-1 text-xs uppercase tracking-wide ${RISK_TONE[action.riskLevel] ?? RISK_TONE.low}`}>
                  {action.riskLevel} risk
                </p>
              </div>
              <p className="shrink-0 text-xs text-[var(--foreground)]/40">
                Expires {new Date(approval.expiresAt).toLocaleString()}
              </p>
            </div>

            {action.context && Object.keys(action.context).length > 0 && (
              <pre className="mt-3 overflow-x-auto rounded-lg bg-[var(--surface)] p-3 text-xs">
                {JSON.stringify(action.context, null, 2)}
              </pre>
            )}

            <input
              value={reasonDrafts[approval.id] ?? ""}
              onChange={(e) =>
                setReasonDrafts((prev) => ({ ...prev, [approval.id]: e.target.value }))
              }
              placeholder="Optional reason (visible in the audit log)"
              className="mt-3 w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm placeholder:text-[var(--foreground)]/30 focus:border-[var(--accent)]/50 focus:outline-none"
            />

            <div className="mt-3 flex gap-2">
              <button
                onClick={() => decide(approval.id, "approved")}
                disabled={decidingId === approval.id}
                className="rounded-lg bg-[var(--ok)] px-4 py-2 text-sm font-medium text-[#04140c] disabled:opacity-40"
              >
                Approve
              </button>
              <button
                onClick={() => decide(approval.id, "denied")}
                disabled={decidingId === approval.id}
                className="rounded-lg border border-[var(--danger)]/40 px-4 py-2 text-sm font-medium text-[var(--danger)] disabled:opacity-40"
              >
                Deny
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

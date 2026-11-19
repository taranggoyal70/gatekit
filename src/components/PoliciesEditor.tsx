"use client";

import { useCallback, useEffect, useState } from "react";

type Policy = {
  id: string;
  name: string;
  actionTypePattern: string;
  targetPattern: string;
  minRiskLevel: string;
  decision: string;
  priority: number;
  enabled: boolean;
};

const RISK_LEVELS = ["low", "medium", "high", "critical"];
const DECISIONS = ["allow", "deny", "require_approval"];

const EMPTY_DRAFT = {
  name: "",
  actionTypePattern: "*",
  targetPattern: "*",
  minRiskLevel: "low",
  decision: "require_approval",
  priority: 100,
};

export function PoliciesEditor() {
  const [policies, setPolicies] = useState<Policy[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/policies");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPolicies(data.policies);
    } catch {
      setError("Failed to load policies.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createPolicy() {
    if (!draft.name.trim()) {
      setError("Give the policy a name.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? "Failed to create policy.");
      }
      setDraft(EMPTY_DRAFT);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create policy.");
    } finally {
      setCreating(false);
    }
  }

  // Optimistic, but never left wrong: if the server refuses, restore the
  // previous list and say so. A governance UI must not show a policy as
  // enabled when it is not.
  async function toggleEnabled(policy: Policy) {
    const previous = policies;
    setError(null);
    setPolicies((prev) =>
      prev?.map((p) => (p.id === policy.id ? { ...p, enabled: !p.enabled } : p)) ?? null,
    );
    try {
      const res = await fetch(`/api/policies/${policy.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !policy.enabled }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { policy: Policy };
      setPolicies((prev) => prev?.map((p) => (p.id === policy.id ? data.policy : p)) ?? null);
    } catch {
      setPolicies(previous);
      setError(`Could not ${policy.enabled ? "disable" : "enable"} "${policy.name}". Nothing changed.`);
    }
  }

  async function remove(policyId: string) {
    const previous = policies;
    setError(null);
    setPolicies((prev) => prev?.filter((p) => p.id !== policyId) ?? null);
    try {
      const res = await fetch(`/api/policies/${policyId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setPolicies(previous);
      setError("Could not delete the policy. Nothing changed.");
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-4 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-[var(--line)] p-4">
        <p className="mb-3 text-sm font-medium">New policy</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="Block competitor emails"
              className="input w-full"
            />
          </Field>
          <Field label="Priority (lower = evaluated first)">
            <input
              type="number"
              value={draft.priority}
              onChange={(e) => setDraft((d) => ({ ...d, priority: Number(e.target.value) }))}
              className="input w-full"
            />
          </Field>
          <Field label="Action type pattern">
            <input
              value={draft.actionTypePattern}
              onChange={(e) => setDraft((d) => ({ ...d, actionTypePattern: e.target.value }))}
              placeholder="email.* or payment.refund"
              className="input w-full"
            />
          </Field>
          <Field label="Target pattern">
            <input
              value={draft.targetPattern}
              onChange={(e) => setDraft((d) => ({ ...d, targetPattern: e.target.value }))}
              placeholder="*@competitor.com"
              className="input w-full"
            />
          </Field>
          <Field label="Minimum risk level">
            <select
              value={draft.minRiskLevel}
              onChange={(e) => setDraft((d) => ({ ...d, minRiskLevel: e.target.value }))}
              className="input w-full"
            >
              {RISK_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Decision">
            <select
              value={draft.decision}
              onChange={(e) => setDraft((d) => ({ ...d, decision: e.target.value }))}
              className="input w-full"
            >
              {DECISIONS.map((decision) => (
                <option key={decision} value={decision}>
                  {decision.replace("_", " ")}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <button
          onClick={createPolicy}
          disabled={creating}
          className="mt-4 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#04141a] disabled:opacity-40"
        >
          {creating ? "Creating…" : "Create policy"}
        </button>
      </div>

      {policies === null ? (
        <div className="h-32 animate-pulse rounded-xl border border-[var(--line)]" />
      ) : policies.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] p-8 text-center text-sm text-[var(--foreground)]/60">
          No policies yet. Without one, only high/critical-risk actions are held for approval by default.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--line)]">
          {policies.map((policy) => (
            <div
              key={policy.id}
              className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-4 py-3 last:border-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{policy.name}</p>
                <p className="mt-0.5 truncate text-xs text-[var(--foreground)]/50">
                  {policy.actionTypePattern} → {policy.targetPattern} · risk ≥ {policy.minRiskLevel} · priority{" "}
                  {policy.priority}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="rounded-full bg-[var(--line)] px-2.5 py-1 text-xs capitalize">
                  {policy.decision.replace("_", " ")}
                </span>
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={policy.enabled}
                    onChange={() => toggleEnabled(policy)}
                  />
                  Enabled
                </label>
                <button
                  onClick={() => remove(policy.id)}
                  className="text-xs text-[var(--danger)] hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-[var(--foreground)]/50">{label}</span>
      {children}
    </label>
  );
}

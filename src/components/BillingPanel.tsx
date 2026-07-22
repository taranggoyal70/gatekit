"use client";

import { useCallback, useEffect, useState } from "react";

type BillingStatus = {
  plan: string;
  // Infinity (the enterprise tier's "unlimited") serializes to null over
  // JSON, not the number Infinity — the client must check for null, not
  // compare against Infinity, or "unlimited" would render as blank/NaN.
  limits: { maxAgents: number | null; maxMembers: number | null; monthlyActionLimit: number | null };
  subscription: { status: string; currentPeriodEnd: string | null } | null;
};

export function BillingPanel() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/status");
      if (!res.ok) throw new Error();
      setStatus(await res.json());
    } catch {
      setError("Failed to load billing status.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("billing") === "success") {
      load();
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [load]);

  async function upgrade() {
    setRedirecting(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Failed to start checkout.");
      if (data.url) window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout.");
      setRedirecting(false);
    }
  }

  async function openPortal() {
    setRedirecting(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Failed to open billing portal.");
      if (data.url) window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open billing portal.");
      setRedirecting(false);
    }
  }

  if (status === null) {
    return <div className="h-20 animate-pulse rounded-xl border border-[var(--line)]" />;
  }

  const isPro = status.plan !== "free" && status.subscription?.status === "active";

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-4 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between rounded-xl border border-[var(--line)] p-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                isPro ? "bg-[var(--accent)]" : "bg-[var(--foreground)]/30"
              }`}
            />
            <p className="text-sm font-medium capitalize">{status.plan} plan</p>
          </div>
          <p className="mt-1 text-xs text-[var(--foreground)]/50">
            {status.limits.maxAgents === null
              ? "Unlimited agents"
              : `Up to ${status.limits.maxAgents} agents`}
            {" · "}
            {status.limits.maxMembers === null
              ? "unlimited members"
              : `${status.limits.maxMembers} members`}
            {status.subscription?.currentPeriodEnd &&
              ` · renews ${new Date(status.subscription.currentPeriodEnd).toLocaleDateString()}`}
          </p>
        </div>
        {isPro ? (
          <button
            onClick={openPortal}
            disabled={redirecting}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            {redirecting ? "Opening…" : "Manage subscription"}
          </button>
        ) : (
          <button
            onClick={upgrade}
            disabled={redirecting}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#04141a] disabled:opacity-40"
          >
            {redirecting ? "Redirecting…" : "Upgrade to Pro"}
          </button>
        )}
      </div>
    </div>
  );
}

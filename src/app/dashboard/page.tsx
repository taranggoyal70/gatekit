import { count, eq } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/db/client";
import { actions } from "@/db/schema";
import { requireOrgContext } from "@/lib/auth";
import { DashboardShell } from "@/components/DashboardShell";
import { listAgents } from "@/lib/services/agents";
import { listActions } from "@/lib/services/actions";
import { listPendingApprovals } from "@/lib/services/approvals";
import { DecisionBadge } from "@/components/DecisionBadge";

export default async function DashboardPage() {
  const { org } = await requireOrgContext();
  const database = db();
  const [agents, recentActions, pendingApprovals, [totals]] = await Promise.all([
    listAgents(database, org.id),
    listActions(database, org.id, { limit: 10 }),
    listPendingApprovals(database, org.id),
    database.select({ actions: count() }).from(actions).where(eq(actions.orgId, org.id)),
  ]);

  return (
    <DashboardShell>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
          <p className="mt-1 text-sm text-[var(--foreground)]/60">
            Every action your agents take, gated by policy, logged forever.
          </p>
        </div>
        <Link
          href="/agents"
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#04141a]"
        >
          Connect an agent
        </Link>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Registered agents" value={agents.length} />
        <StatCard label="Pending approvals" value={pendingApprovals.length} tone={pendingApprovals.length > 0 ? "warn" : undefined} />
        <StatCard label="Actions recorded" value={totals?.actions ?? 0} />
      </div>

      {pendingApprovals.length > 0 && (
        <div className="mb-8 rounded-xl border border-[var(--warn)]/30 bg-[var(--warn)]/5 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {pendingApprovals.length} action{pendingApprovals.length === 1 ? "" : "s"} waiting on you
            </p>
            <Link href="/approvals" className="text-sm font-medium text-[var(--accent)]">
              Review →
            </Link>
          </div>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--foreground)]/50">
          Recent activity
        </h2>
        {recentActions.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--line)]">
            {recentActions.map((action) => (
              <div
                key={action.id}
                className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{action.actionType}</p>
                  <p className="truncate text-xs text-[var(--foreground)]/50">{action.target}</p>
                </div>
                <DecisionBadge decision={action.decision} status={action.status} />
              </div>
            ))}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn";
}) {
  return (
    <div className="rounded-xl border border-[var(--line)] p-4">
      <p className="text-xs text-[var(--foreground)]/50">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold ${
          tone === "warn" ? "text-[var(--warn)]" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-[var(--line)] p-8 text-center">
      <p className="text-sm text-[var(--foreground)]/60">
        No actions recorded yet. Once an agent calls the Gatekit SDK, activity shows up here.
      </p>
    </div>
  );
}

import { DashboardShell } from "@/components/DashboardShell";
import { AgentsManager } from "@/components/AgentsManager";

export default function AgentsPage() {
  return (
    <DashboardShell>
      <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
      <p className="mt-1 text-sm text-[var(--foreground)]/60">
        Each agent gets its own key so you can scope policies and audit trails per agent.
      </p>
      <div className="mt-6">
        <AgentsManager />
      </div>
    </DashboardShell>
  );
}

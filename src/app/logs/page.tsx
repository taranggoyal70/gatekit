import { DashboardShell } from "@/components/DashboardShell";
import { AuditIntegrity } from "@/components/AuditIntegrity";
import { AuditLog } from "@/components/AuditLog";

export default function LogsPage() {
  return (
    <DashboardShell>
      <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
      <p className="mt-1 text-sm text-[var(--foreground)]/60">
        A hash-chained record of every action your agents attempted and every
        approval and policy change. Edits, deletions and reordering are
        detected on verification.
      </p>
      <div className="mt-6">
        <AuditIntegrity />
      </div>
      <div className="mt-6">
        <AuditLog />
      </div>
    </DashboardShell>
  );
}

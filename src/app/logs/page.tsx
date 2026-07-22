import { DashboardShell } from "@/components/DashboardShell";
import { AuditLog } from "@/components/AuditLog";

export default function LogsPage() {
  return (
    <DashboardShell>
      <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
      <p className="mt-1 text-sm text-[var(--foreground)]/60">
        An immutable record of every action your agents attempted.
      </p>
      <div className="mt-6">
        <AuditLog />
      </div>
    </DashboardShell>
  );
}

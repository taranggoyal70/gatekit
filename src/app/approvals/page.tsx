import { DashboardShell } from "@/components/DashboardShell";
import { ApprovalsQueue } from "@/components/ApprovalsQueue";

export default function ApprovalsPage() {
  return (
    <DashboardShell>
      <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
      <p className="mt-1 text-sm text-[var(--foreground)]/60">
        Actions your policies flagged for human review, held until you decide.
      </p>
      <div className="mt-6">
        <ApprovalsQueue />
      </div>
    </DashboardShell>
  );
}

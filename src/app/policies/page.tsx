import { DashboardShell } from "@/components/DashboardShell";
import { PoliciesEditor } from "@/components/PoliciesEditor";

export default function PoliciesPage() {
  return (
    <DashboardShell>
      <h1 className="text-2xl font-semibold tracking-tight">Policies</h1>
      <p className="mt-1 text-sm text-[var(--foreground)]/60">
        Rules are evaluated in priority order — the first enabled match decides an action.
      </p>
      <div className="mt-6">
        <PoliciesEditor />
      </div>
    </DashboardShell>
  );
}

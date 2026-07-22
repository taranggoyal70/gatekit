import { BillingPanel } from "@/components/BillingPanel";
import { DashboardShell } from "@/components/DashboardShell";
import { TeamPanel } from "@/components/TeamPanel";

export default function SettingsPage() {
  return (
    <DashboardShell>
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <div className="mt-8 space-y-10">
        <section>
          <h2 className="mb-1 text-lg font-semibold tracking-tight">Billing</h2>
          <p className="mb-4 text-sm text-[var(--foreground)]/60">
            Manage your plan and subscription.
          </p>
          <BillingPanel />
        </section>
        <section>
          <h2 className="mb-1 text-lg font-semibold tracking-tight">Team</h2>
          <p className="mb-4 text-sm text-[var(--foreground)]/60">
            Invite teammates and manage roles. Admins and owners can invite, change roles, and
            remove members.
          </p>
          <TeamPanel />
        </section>
      </div>
    </DashboardShell>
  );
}

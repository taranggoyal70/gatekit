"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/approvals", label: "Approvals" },
  { href: "/policies", label: "Policies" },
  { href: "/agents", label: "Agents" },
  { href: "/logs", label: "Audit log" },
  { href: "/settings", label: "Settings" },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="gate-app-shell">
      <aside className="gate-app-sidebar">
        <Link href="/dashboard" className="gate-app-brand">
          <span>G/</span>
          <div><strong>Gatekit</strong><small>Control plane</small></div>
        </Link>

        <div className="gate-app-runtime">
          <span><i /> Runtime healthy</span>
          <code>us-west-2</code>
        </div>

        <nav aria-label="Gatekit workspace">
          {NAV_ITEMS.map((item, index) => {
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href} className={active ? "is-active" : ""}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {item.label}
                {item.label === "Approvals" && <i aria-label="Pending activity" />}
              </Link>
            );
          })}
        </nav>

        <div className="gate-app-sidebar-foot">
          <Link href="/docs">SDK documentation ↗</Link>
          <div><UserButton /><span>Workspace owner</span></div>
        </div>
      </aside>

      <div className="gate-app-workspace">
        <header className="gate-app-topbar">
          <div>
            <span className="gate-app-mobile-mark">G/</span>
            <p>Production workspace</p>
          </div>
          <div className="gate-app-topbar-meta">
            <span>Policy latency <strong>20ms</strong></span>
            <span>Coverage <strong>100%</strong></span>
            <UserButton />
          </div>
        </header>
        <main className="gate-app-main">{children}</main>
      </div>
    </div>
  );
}

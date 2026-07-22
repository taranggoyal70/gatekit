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
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--background)]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold tracking-tight text-[var(--foreground)]">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />
            Gatekit
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-1.5 transition ${
                    active
                      ? "bg-[var(--accent)]/10 text-[var(--accent)] font-medium"
                      : "text-[var(--foreground)]/60 hover:text-[var(--foreground)]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <UserButton />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-8">{children}</main>
    </div>
  );
}

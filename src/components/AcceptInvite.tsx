"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "accepting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);

  async function accept() {
    setState("accepting");
    setError(null);
    try {
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Failed to accept invite.");
      setOrgName(data.org?.name ?? "the organization");
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invite.");
      setState("error");
    }
  }

  if (orgName) {
    return (
      <div className="text-center">
        <p className="text-lg font-medium">You&apos;re in! Redirecting to {orgName}…</p>
      </div>
    );
  }

  return (
    <div className="max-w-sm text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Join this organization?</h1>
      <p className="mt-2 text-sm text-[var(--foreground)]/60">
        Accept to get access to its agents, policies, and audit log.
      </p>
      {error && (
        <div className="mt-4 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-4 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}
      <button
        onClick={accept}
        disabled={state === "accepting"}
        className="mt-6 w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-medium text-[#04141a] disabled:opacity-40"
      >
        {state === "accepting" ? "Joining…" : "Accept invite"}
      </button>
    </div>
  );
}

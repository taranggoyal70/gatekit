"use client";

import { useCallback, useEffect, useState } from "react";

type Agent = {
  id: string;
  name: string;
  description: string | null;
  keyPrefix: string;
  createdAt: string;
  lastSeenAt: string | null;
};

export function AgentsManager() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/agents");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAgents(data.agents);
    } catch {
      setError("Failed to load agents.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createAgent() {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Failed to create agent.");
      setRevealedKey(data.key);
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent.");
    } finally {
      setCreating(false);
    }
  }

  // A failed revoke must never look like a successful one: the key would
  // still authenticate while the UI showed it gone.
  async function revoke(agentId: string) {
    const previous = agents;
    setError(null);
    setAgents((prev) => prev?.filter((a) => a.id !== agentId) ?? null);
    try {
      const res = await fetch(`/api/agents/${agentId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setAgents(previous);
      setError("Could not revoke the key. It is still active; try again.");
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-4 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {revealedKey && (
        <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4">
          <p className="text-sm font-medium text-[var(--accent)]">
            Copy this key now. It won&apos;t be shown again.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-[var(--surface)] px-3 py-2 font-mono text-xs">
              {revealedKey}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(revealedKey)}
              className="shrink-0 rounded-lg border border-[var(--accent)]/30 px-3 py-2 text-xs font-medium text-[var(--accent)]"
            >
              Copy
            </button>
          </div>
          <button
            onClick={() => setRevealedKey(null)}
            className="mt-2 text-xs text-[var(--foreground)]/50"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !creating && createAgent()}
          placeholder="Agent name (e.g. support-triage-bot)"
          className="input flex-1"
        />
        <button
          onClick={createAgent}
          disabled={creating}
          className="shrink-0 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#04141a] disabled:opacity-40"
        >
          {creating ? "Creating…" : "Create agent"}
        </button>
      </div>

      {agents === null ? (
        <div className="h-24 animate-pulse rounded-xl border border-[var(--line)]" />
      ) : agents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] p-8 text-center text-sm text-[var(--foreground)]/60">
          No agents yet. Create one and wire the key into your agent via @gatekit/sdk.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--line)]">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3 last:border-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{agent.name}</p>
                <p className="mt-0.5 font-mono text-xs text-[var(--foreground)]/50">
                  {agent.keyPrefix}…
                </p>
              </div>
              <button
                onClick={() => revoke(agent.id)}
                className="shrink-0 text-xs text-[var(--danger)] hover:underline"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)]/50 p-4">
        <p className="text-xs font-medium">Quick start</p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-[var(--background)] p-3 font-mono text-xs leading-5">
{`import { GatekitClient } from "@gatekit/sdk";

const gatekit = new GatekitClient({ apiKey: process.env.GATEKIT_KEY! });

await gatekit.guard(
  { actionType: "email.send", target: to, riskLevel: "medium" },
  () => sendEmail(to, body),
);`}
        </pre>
      </div>
    </div>
  );
}

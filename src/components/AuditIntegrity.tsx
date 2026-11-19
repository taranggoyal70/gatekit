"use client";

import { useCallback, useEffect, useState } from "react";

type Verification = {
  ok: boolean;
  chain: {
    ok: boolean;
    checked: number;
    headSeq: number;
    headHash: string;
    failures: { seq: number; kind: string; detail: string }[];
  };
  actions: {
    checked: number;
    failures: { actionId: string; kind: string; detail: string }[];
  };
  verifiedAt: string;
};

/**
 * Re-verifies the org's audit hash chain on load and on demand, and exposes
 * the head as a checkpoint the user can store outside Gatekit. A stored
 * checkpoint is what lets a later verification detect truncation or a full
 * rewrite (see SECURITY.md).
 */
export function AuditIntegrity() {
  const [result, setResult] = useState<Verification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const verify = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/audit/verify", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setResult(await res.json());
    } catch {
      setError("Could not verify the audit chain.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void verify();
  }, [verify]);

  async function copyCheckpoint() {
    if (!result) return;
    const checkpoint = JSON.stringify({ seq: result.chain.headSeq, hash: result.chain.headHash });
    try {
      await navigator.clipboard.writeText(checkpoint);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Copy failed; select the hash and copy it manually.");
    }
  }

  const failures = result ? result.chain.failures.length + result.actions.failures.length : 0;
  const tone = !result ? "line" : result.ok ? "ok" : "danger";

  return (
    <section
      aria-live="polite"
      className={`rounded-xl border px-4 py-3 ${
        tone === "ok"
          ? "border-[var(--ok)]/30 bg-[var(--ok)]/5"
          : tone === "danger"
            ? "border-[var(--danger)]/40 bg-[var(--danger)]/5"
            : "border-[var(--line)]"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {error
              ? error
              : !result
                ? "Verifying audit chain…"
                : result.ok
                  ? `Chain verified: ${result.chain.checked.toLocaleString()} events, ${result.actions.checked.toLocaleString()} actions cross-checked`
                  : `Integrity check failed: ${failures} ${failures === 1 ? "problem" : "problems"} found`}
          </p>
          {result && (
            <p className="mt-0.5 truncate font-mono text-xs text-[var(--foreground)]/50" title={result.chain.headHash}>
              head #{result.chain.headSeq} · {result.chain.headHash.slice(0, 16)}…
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={copyCheckpoint}
            disabled={!result}
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium transition hover:border-[var(--foreground)]/30 disabled:opacity-40"
          >
            {copied ? "Copied" : "Copy checkpoint"}
          </button>
          <button
            onClick={() => void verify()}
            disabled={busy}
            className="rounded-lg bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/20 disabled:opacity-40"
          >
            {busy ? "Verifying…" : "Verify again"}
          </button>
        </div>
      </div>
      {result && !result.ok && (
        <ul className="mt-3 space-y-1 text-xs text-[var(--danger)]">
          {result.chain.failures.slice(0, 5).map((failure) => (
            <li key={`c-${failure.seq}-${failure.kind}`}>
              Event #{failure.seq}: {failure.detail}
            </li>
          ))}
          {result.actions.failures.slice(0, 5).map((failure) => (
            <li key={`a-${failure.actionId}-${failure.kind}`}>
              Action {failure.actionId.slice(0, 8)}: {failure.detail}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

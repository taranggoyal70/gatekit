"use client";

import { useCallback, useEffect, useState } from "react";

export function NotificationsPanel() {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/notifications");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setWebhookUrl(data.slackWebhookUrl ?? "");
      setSaved(Boolean(data.slackWebhookUrl));
    } catch {
      setError("Failed to load notification settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slackWebhookUrl: webhookUrl.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Failed to save.");
      setSaved(Boolean(data.slackWebhookUrl));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setError(null);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/notifications/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Failed to send test message.");
      setTestResult("Test message sent. Check your Slack channel.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send test message.");
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return <div className="h-20 animate-pulse rounded-xl border border-[var(--line)]" />;
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-4 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}
      {testResult && (
        <div className="rounded-lg border border-[var(--ok)]/30 bg-[var(--ok)]/5 px-4 py-2 text-sm text-[var(--ok)]">
          {testResult}
        </div>
      )}

      <div className="rounded-xl border border-[var(--line)] p-4">
        <p className="mb-1 text-sm font-medium">Slack webhook URL</p>
        <p className="mb-3 text-xs text-[var(--foreground)]/50">
          Pending approvals will post to this incoming webhook. Create one at{" "}
          <a
            href="https://api.slack.com/messaging/webhooks"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--accent)] hover:underline"
          >
            api.slack.com/messaging/webhooks
          </a>
          .
        </p>
        <div className="flex gap-2">
          <input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/…"
            className="input flex-1"
          />
          <button
            onClick={save}
            disabled={saving}
            className="shrink-0 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#04141a] disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        {saved && (
          <button
            onClick={sendTest}
            disabled={testing}
            className="mt-3 rounded-lg border border-[var(--line)] px-4 py-2 text-xs font-medium disabled:opacity-40"
          >
            {testing ? "Sending…" : "Send test message"}
          </button>
        )}
      </div>
    </div>
  );
}

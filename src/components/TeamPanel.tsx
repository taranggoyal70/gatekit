"use client";

import { useCallback, useEffect, useState } from "react";

type Member = {
  id: string;
  userId: string;
  email: string | null;
  role: "owner" | "admin" | "member";
  createdAt: string;
};

type Invite = {
  id: string;
  email: string;
  role: "admin" | "member";
  expiresAt: string;
  createdAt: string;
};

const ROLES: Array<"owner" | "admin" | "member"> = ["owner", "admin", "member"];

export function TeamPanel() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [membersRes, invitesRes] = await Promise.all([
        fetch("/api/team/members"),
        fetch("/api/team/invites"),
      ]);
      if (!membersRes.ok || !invitesRes.ok) throw new Error();
      const membersData = await membersRes.json();
      const invitesData = await invitesRes.json();
      setMembers(membersData.members);
      setInvites(invitesData.invites);
    } catch {
      setError("Failed to load team data.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function sendInvite() {
    if (!email.trim()) return;
    setInviting(true);
    setError(null);
    try {
      const res = await fetch("/api/team/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Failed to send invite.");
      setEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invite.");
    } finally {
      setInviting(false);
    }
  }

  async function revokeInvite(inviteId: string) {
    setInvites((prev) => prev?.filter((i) => i.id !== inviteId) ?? null);
    await fetch(`/api/team/invites/${inviteId}`, { method: "DELETE" });
  }

  async function changeRole(memberId: string, newRole: string) {
    const res = await fetch(`/api/team/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error?.message ?? "Failed to update role.");
      return;
    }
    await load();
  }

  async function removeMember(memberId: string) {
    const res = await fetch(`/api/team/members/${memberId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error?.message ?? "Failed to remove member.");
      return;
    }
    setMembers((prev) => prev?.filter((m) => m.id !== memberId) ?? null);
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-4 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-[var(--line)] p-4">
        <p className="mb-3 text-sm font-medium">Invite a teammate</p>
        <div className="flex gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !inviting && sendInvite()}
            placeholder="teammate@company.com"
            className="input flex-1"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "member")}
            className="input w-32"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button
            onClick={sendInvite}
            disabled={inviting}
            className="shrink-0 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#04141a] disabled:opacity-40"
          >
            {inviting ? "Sending…" : "Invite"}
          </button>
        </div>
      </div>

      {invites && invites.length > 0 && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-[var(--foreground)]/50">
            Pending invites
          </p>
          <div className="overflow-hidden rounded-xl border border-[var(--line)]">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium">{invite.email}</p>
                  <p className="text-xs text-[var(--foreground)]/50 capitalize">
                    {invite.role} · expires {new Date(invite.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => revokeInvite(invite.id)}
                  className="text-xs text-[var(--danger)] hover:underline"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-[var(--foreground)]/50">
          Members
        </p>
        {members === null ? (
          <div className="h-24 animate-pulse rounded-xl border border-[var(--line)]" />
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--line)]">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3 last:border-0"
              >
                <p className="text-sm">
                  {member.email ?? (
                    <span className="font-mono text-[var(--foreground)]/50">{member.userId}</span>
                  )}
                </p>
                <div className="flex items-center gap-3">
                  <select
                    value={member.role}
                    onChange={(e) => changeRole(member.id, e.target.value)}
                    className="input w-32"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeMember(member.id)}
                    className="text-xs text-[var(--danger)] hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

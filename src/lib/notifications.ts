import "server-only";

import { eq } from "drizzle-orm";
import { Resend } from "resend";

import { db } from "@/db/client";
import { orgMembers } from "@/db/schema";
import type { Action } from "@/db/schema";
import { resolveUserEmails } from "@/lib/user-directory";

let _resend: Resend | null = null;

/**
 * Email is on only when both the Resend key and a sender are set. There is
 * no default sender: Resend rejects any address on a domain you have not
 * verified with it, so a built-in default would fail on every send.
 */
function mailer(): { client: Resend; from: string } | null {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.GATEKIT_NOTIFICATION_FROM;
  if (!key || !from) return null;
  _resend ??= new Resend(key);
  return { client: _resend, from };
}

/**
 * Best-effort email fan-out to every member of the org when an action is
 * held for approval. Unconfigured email or Clerk lookup failures must
 * never fail the evaluate() call — the action is already correctly recorded
 * as pending regardless of whether anyone gets notified about it.
 */
export async function sendApprovalRequestEmail(orgId: string, action: Action) {
  const mail = mailer();
  if (!mail) return;
  const { client, from } = mail;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const members = await db()
    .select({ userId: orgMembers.userId })
    .from(orgMembers)
    .where(eq(orgMembers.orgId, orgId));

  const emailsByUserId = await resolveUserEmails(members.map((m) => m.userId));
  const recipients = Object.values(emailsByUserId);
  if (recipients.length === 0) return;

  await client.emails.send({
    from,
    to: recipients,
    subject: `Approval needed: ${action.actionType} on ${action.target}`,
    text: [
      `An agent action is waiting for your approval.`,
      ``,
      `Action: ${action.actionType}`,
      `Target: ${action.target}`,
      `Risk level: ${action.riskLevel}`,
      ``,
      `Review it here: ${siteUrl}/approvals`,
    ].join("\n"),
  });
}

/**
 * Unlike the approval notification, an invite email failing to send is a
 * real problem the caller should know about — the invite row exists but the
 * invitee has no way to discover it otherwise, so this throws instead of
 * swallowing the error.
 */
export async function sendInviteEmail(
  orgName: string,
  invite: { email: string; token: string; invitedByEmail: string },
) {
  const mail = mailer();
  if (!mail) return;
  const { client, from } = mail;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  await client.emails.send({
    from,
    to: [invite.email],
    subject: `${invite.invitedByEmail} invited you to ${orgName} on Gatekit`,
    text: [
      `${invite.invitedByEmail} invited you to join "${orgName}" on Gatekit.`,
      ``,
      `Accept the invite: ${siteUrl}/invite/${invite.token}`,
      ``,
      `This invite expires in 7 days.`,
    ].join("\n"),
  });
}

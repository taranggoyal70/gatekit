import "server-only";

import { and, asc, eq, lt } from "drizzle-orm";
import { z } from "zod";

import { organizations, orgMembers, invites } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { generateInviteToken } from "@/lib/invite-tokens";
import { sendInviteEmail } from "@/lib/notifications";
import { PG_UNIQUE_VIOLATION, pgErrorCode } from "@/lib/pg-error";
import { assertMemberCapacity, countMembers } from "@/lib/services/team";
import type { Database } from "@/lib/services/types";

export const inviteInputSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(["admin", "member"]).default("member"),
});

export type InviteInput = z.infer<typeof inviteInputSchema>;

const INVITE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function listPendingInvites(database: Database, orgId: string) {
  await expirePastDueInvites(database, orgId);
  return database
    .select()
    .from(invites)
    .where(and(eq(invites.orgId, orgId), eq(invites.status, "pending")))
    .orderBy(asc(invites.createdAt));
}

export async function createInvite(
  database: Database,
  orgId: string,
  invitedByUserId: string,
  invitedByEmail: string,
  input: InviteInput,
) {
  const memberCount = await countMembers(database, orgId);
  assertMemberCapacity(memberCount);

  const [org] = await database
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) throw new AppError("Organization not found.", 404, "not_found");

  const email = input.email.toLowerCase().trim();
  const token = generateInviteToken();

  const [invite] = await database
    .insert(invites)
    .values({
      orgId,
      email,
      role: input.role,
      token,
      invitedBy: invitedByUserId,
      expiresAt: new Date(Date.now() + INVITE_WINDOW_MS),
    })
    .returning()
    .catch((error) => {
      if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) {
        throw new AppError(
          "There is already a pending invite for this email.",
          409,
          "already_invited",
        );
      }
      throw error;
    });

  if (!invite) throw new AppError("Failed to create invite.", 500, "internal_error");

  await sendInviteEmail(org.name, { email, token, invitedByEmail }).catch((error) =>
    console.error("Failed to send invite email", error),
  );

  return invite;
}

export async function revokeInvite(database: Database, orgId: string, inviteId: string) {
  const [invite] = await database
    .select()
    .from(invites)
    .where(and(eq(invites.id, inviteId), eq(invites.orgId, orgId)))
    .limit(1);
  if (!invite) throw new AppError("Invite not found.", 404, "not_found");
  if (invite.status !== "pending") {
    throw new AppError("Only pending invites can be revoked.", 409, "not_pending");
  }

  const [updated] = await database
    .update(invites)
    .set({ status: "revoked" })
    .where(eq(invites.id, inviteId))
    .returning();
  return updated;
}

export async function acceptInvite(
  database: Database,
  token: string,
  acceptingUser: { userId: string; email: string },
) {
  const [invite] = await database
    .select()
    .from(invites)
    .where(eq(invites.token, token))
    .limit(1);
  if (!invite) throw new AppError("Invite not found.", 404, "not_found");

  if (invite.status === "pending" && invite.expiresAt.getTime() < Date.now()) {
    await database.update(invites).set({ status: "expired" }).where(eq(invites.id, invite.id));
    throw new AppError("This invite has expired.", 410, "expired");
  }
  if (invite.status !== "pending") {
    throw new AppError(`This invite is no longer valid (${invite.status}).`, 410, invite.status);
  }
  if (invite.email !== acceptingUser.email.toLowerCase().trim()) {
    throw new AppError(
      "This invite was sent to a different email address. Sign in with that address to accept it.",
      403,
      "email_mismatch",
    );
  }

  const memberCount = await countMembers(database, invite.orgId);
  assertMemberCapacity(memberCount);

  await database
    .insert(orgMembers)
    .values({ orgId: invite.orgId, userId: acceptingUser.userId, role: invite.role })
    .onConflictDoNothing({ target: [orgMembers.orgId, orgMembers.userId] });

  const [updatedInvite] = await database
    .update(invites)
    .set({ status: "accepted" })
    .where(eq(invites.id, invite.id))
    .returning();

  const [org] = await database
    .select()
    .from(organizations)
    .where(eq(organizations.id, invite.orgId))
    .limit(1);

  return { invite: updatedInvite, org };
}

/** Same lazy-reap pattern as approvals: expiry is checked on read, not by a
 * background job — an invite nobody has looked at yet doesn't need one. */
export async function expirePastDueInvites(database: Database, orgId: string) {
  const now = new Date();
  await database
    .update(invites)
    .set({ status: "expired" })
    .where(
      and(eq(invites.orgId, orgId), eq(invites.status, "pending"), lt(invites.expiresAt, now)),
    );
}

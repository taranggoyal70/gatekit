import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { orgMembers, organizations } from "@/db/schema";
import { AppError } from "@/lib/errors";

export type AuthedUser = {
  userId: string;
  email: string;
};

export async function requireUser(): Promise<AuthedUser> {
  const { userId } = await auth();
  if (!userId) throw new AppError("Authentication required.", 401, "unauthorized");
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  return { userId, email };
}

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "team";
}

/**
 * Every user gets an owned organization lazily created on first
 * authenticated request. Once teams/invites exist, a user can belong to
 * more than one org — "default" means the earliest membership by
 * creation time (their own org, in the common case), picked
 * deterministically rather than by whatever order Postgres happens to
 * return rows in.
 */
export async function getOrCreateDefaultOrg(user: AuthedUser) {
  const database = db();

  const [existing] = await database
    .select({ org: organizations, role: orgMembers.role })
    .from(orgMembers)
    .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
    .where(eq(orgMembers.userId, user.userId))
    .orderBy(asc(orgMembers.createdAt))
    .limit(1);
  if (existing) return existing;

  const baseName = user.email ? (user.email.split("@")[0] ?? "My") : "My";
  const orgName = `${baseName}'s Organization`;
  const baseSlug = slugify(baseName);

  return await database.transaction(async (tx) => {
    let slug = baseSlug;
    let attempt = 0;
    // Slugs must be unique; retry with a numeric suffix on collision rather
    // than failing signup outright for a cosmetic conflict.
    for (;;) {
      const [conflict] = await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, slug))
        .limit(1);
      if (!conflict) break;
      attempt += 1;
      slug = `${baseSlug}-${attempt + 1}`;
    }

    const [org] = await tx
      .insert(organizations)
      .values({ name: orgName, slug })
      .returning();
    if (!org) throw new AppError("Failed to create organization.", 500, "internal_error");

    await tx.insert(orgMembers).values({
      orgId: org.id,
      userId: user.userId,
      role: "owner",
    });

    return { org, role: "owner" as const };
  });
}

/**
 * Resolves (and lazily creates) the current request's org context in one
 * call — every dashboard-facing API route needs exactly this before it can
 * touch org-scoped data.
 */
export async function requireOrgContext() {
  const user = await requireUser();
  const { org, role } = await getOrCreateDefaultOrg(user);
  return { user, org, role };
}

export async function requireOrgMembership(userId: string, orgId: string) {
  const database = db();
  const [membership] = await database
    .select()
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
    .limit(1);
  if (!membership) {
    throw new AppError("You do not have access to this organization.", 403, "forbidden");
  }
  return membership;
}

const ROLE_RANK: Record<"owner" | "admin" | "member", number> = {
  member: 0,
  admin: 1,
  owner: 2,
};

/**
 * Membership management (invite, remove, change role) is restricted to
 * admins and owners — a plain member can use the product but shouldn't be
 * able to add or remove other seats.
 */
export async function requireOrgRole(
  userId: string,
  orgId: string,
  minRole: "owner" | "admin" | "member",
) {
  const membership = await requireOrgMembership(userId, orgId);
  if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
    throw new AppError(
      `This action requires the "${minRole}" role or higher.`,
      403,
      "insufficient_role",
    );
  }
  return membership;
}

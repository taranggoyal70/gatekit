import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";

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
 * MVP org model: one default organization per user, created lazily on first
 * authenticated request rather than via a signup webhook. This keeps
 * onboarding to zero extra steps — teams/invites are a v2 concern once
 * there's a real multi-seat customer asking for them.
 */
export async function getOrCreateDefaultOrg(user: AuthedUser) {
  const database = db();

  const [existing] = await database
    .select({ org: organizations, role: orgMembers.role })
    .from(orgMembers)
    .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
    .where(eq(orgMembers.userId, user.userId))
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

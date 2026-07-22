import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { orgMembers } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { getPlanLimits } from "@/lib/plan-limits";
import type { Database } from "@/lib/services/types";

export async function listMembers(database: Database, orgId: string) {
  return database
    .select()
    .from(orgMembers)
    .where(eq(orgMembers.orgId, orgId))
    .orderBy(asc(orgMembers.createdAt));
}

export async function countMembers(database: Database, orgId: string): Promise<number> {
  const members = await listMembers(database, orgId);
  return members.length;
}

export function assertMemberCapacity(currentCount: number, planTier: string) {
  const { maxMembers } = getPlanLimits(planTier);
  if (currentCount >= maxMembers) {
    throw new AppError(
      `This organization has reached the limit of ${maxMembers} members on its current plan. Upgrade to add more.`,
      403,
      "limit_reached",
    );
  }
}

async function countOwners(database: Database, orgId: string): Promise<number> {
  const members = await listMembers(database, orgId);
  return members.filter((m) => m.role === "owner").length;
}

export async function updateMemberRole(
  database: Database,
  orgId: string,
  memberId: string,
  role: "owner" | "admin" | "member",
) {
  const [member] = await database
    .select()
    .from(orgMembers)
    .where(and(eq(orgMembers.id, memberId), eq(orgMembers.orgId, orgId)))
    .limit(1);
  if (!member) throw new AppError("Member not found.", 404, "not_found");

  if (member.role === "owner" && role !== "owner") {
    const owners = await countOwners(database, orgId);
    if (owners <= 1) {
      throw new AppError(
        "An organization must have at least one owner — promote someone else first.",
        409,
        "last_owner",
      );
    }
  }

  const [updated] = await database
    .update(orgMembers)
    .set({ role })
    .where(eq(orgMembers.id, memberId))
    .returning();
  return updated;
}

export async function removeMember(database: Database, orgId: string, memberId: string) {
  const [member] = await database
    .select()
    .from(orgMembers)
    .where(and(eq(orgMembers.id, memberId), eq(orgMembers.orgId, orgId)))
    .limit(1);
  if (!member) throw new AppError("Member not found.", 404, "not_found");

  if (member.role === "owner") {
    const owners = await countOwners(database, orgId);
    if (owners <= 1) {
      throw new AppError(
        "Cannot remove the last owner of an organization.",
        409,
        "last_owner",
      );
    }
  }

  await database.delete(orgMembers).where(eq(orgMembers.id, memberId));
}

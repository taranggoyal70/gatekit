import { AppError } from "@/lib/errors";

const ROLE_RANK: Record<"owner" | "admin" | "member", number> = {
  member: 0,
  admin: 1,
  owner: 2,
};

export type OrgRole = keyof typeof ROLE_RANK;

export function hasOrgRole(role: OrgRole, minRole: OrgRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

/** Throws 403 unless `role` is at least `minRole`. */
export function assertOrgRole(role: OrgRole, minRole: OrgRole): void {
  if (!hasOrgRole(role, minRole)) {
    throw new AppError(
      `This action requires the "${minRole}" role or higher.`,
      403,
      "insufficient_role",
    );
  }
}

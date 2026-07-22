import { beforeEach, describe, expect, it } from "vitest";

import { orgMembers, organizations } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { listMembers, removeMember, updateMemberRole } from "@/lib/services/team";
import { testDb, truncateAll } from "@/lib/services/test-db";

const database = testDb();
const describeIfDb = database ? describe : describe.skip;

describeIfDb("team service (integration)", () => {
  let orgId: string;
  let ownerId: string;

  beforeEach(async () => {
    if (!database) return;
    await truncateAll(database);
    const [org] = await database
      .insert(organizations)
      .values({ name: "Test Org", slug: `test-org-${Date.now()}-${Math.random()}` })
      .returning();
    orgId = org!.id;
    ownerId = `user_owner_${Date.now()}`;
    await database.insert(orgMembers).values({ orgId, userId: ownerId, role: "owner" });
  });

  it("lists members ordered by join time", async () => {
    await database!.insert(orgMembers).values({ orgId, userId: "user_b", role: "member" });
    const members = await listMembers(database!, orgId);
    expect(members).toHaveLength(2);
    expect(members[0]?.userId).toBe(ownerId);
  });

  it("updates a member's role", async () => {
    const [member] = await database!
      .insert(orgMembers)
      .values({ orgId, userId: "user_b", role: "member" })
      .returning();
    const updated = await updateMemberRole(database!, orgId, member!.id, "admin");
    expect(updated?.role).toBe("admin");
  });

  it("refuses to demote the last owner", async () => {
    const owner = (await listMembers(database!, orgId))[0]!;
    await expect(updateMemberRole(database!, orgId, owner.id, "admin")).rejects.toThrow(
      /at least one owner/i,
    );
  });

  it("allows demoting an owner when another owner exists", async () => {
    const [secondOwner] = await database!
      .insert(orgMembers)
      .values({ orgId, userId: "user_owner_2", role: "owner" })
      .returning();
    const updated = await updateMemberRole(database!, orgId, secondOwner!.id, "member");
    expect(updated?.role).toBe("member");
  });

  it("removes a non-owner member", async () => {
    const [member] = await database!
      .insert(orgMembers)
      .values({ orgId, userId: "user_b", role: "member" })
      .returning();
    await removeMember(database!, orgId, member!.id);
    const members = await listMembers(database!, orgId);
    expect(members).toHaveLength(1);
  });

  it("refuses to remove the last owner", async () => {
    const owner = (await listMembers(database!, orgId))[0]!;
    await expect(removeMember(database!, orgId, owner.id)).rejects.toThrow(AppError);
  });

  it("throws AppError when acting on a member from a different org", async () => {
    const [otherOrg] = await database!
      .insert(organizations)
      .values({ name: "Other", slug: `other-${Date.now()}` })
      .returning();
    const owner = (await listMembers(database!, orgId))[0]!;
    await expect(removeMember(database!, otherOrg!.id, owner.id)).rejects.toThrow(AppError);
  });
});

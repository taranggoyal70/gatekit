import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { orgMembers, organizations } from "@/db/schema";
import { AppError } from "@/lib/errors";
import {
  acceptInvite,
  createInvite,
  listPendingInvites,
  revokeInvite,
} from "@/lib/services/invites";
import { listMembers } from "@/lib/services/team";
import { testDb, truncateAll } from "@/lib/services/test-db";

const database = testDb();
const describeIfDb = database ? describe : describe.skip;

describeIfDb("invites service (integration)", () => {
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

  it("creates an invite and lists it as pending", async () => {
    await createInvite(database!, orgId, ownerId, "owner@test.com", {
      email: "invitee@test.com",
      role: "member",
    });

    const pending = await listPendingInvites(database!, orgId);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.email).toBe("invitee@test.com");
    expect(pending[0]?.status).toBe("pending");
  });

  it("lowercases the invited email", async () => {
    await createInvite(database!, orgId, ownerId, "owner@test.com", {
      email: "Invitee@TEST.com",
      role: "member",
    });
    const pending = await listPendingInvites(database!, orgId);
    expect(pending[0]?.email).toBe("invitee@test.com");
  });

  it("rejects a duplicate pending invite for the same email", async () => {
    await createInvite(database!, orgId, ownerId, "owner@test.com", {
      email: "invitee@test.com",
      role: "member",
    });

    await expect(
      createInvite(database!, orgId, ownerId, "owner@test.com", {
        email: "invitee@test.com",
        role: "admin",
      }),
    ).rejects.toThrow(/already a pending invite/i);
  });

  it("revokes a pending invite", async () => {
    const invite = await createInvite(database!, orgId, ownerId, "owner@test.com", {
      email: "invitee@test.com",
      role: "member",
    });

    const revoked = await revokeInvite(database!, orgId, invite.id);
    expect(revoked?.status).toBe("revoked");

    const pending = await listPendingInvites(database!, orgId);
    expect(pending).toHaveLength(0);
  });

  it("refuses to revoke a non-pending invite twice", async () => {
    const invite = await createInvite(database!, orgId, ownerId, "owner@test.com", {
      email: "invitee@test.com",
      role: "member",
    });
    await revokeInvite(database!, orgId, invite.id);

    await expect(revokeInvite(database!, orgId, invite.id)).rejects.toThrow(AppError);
  });

  it("accepts an invite and adds the user as a member with the invited role", async () => {
    const invite = await createInvite(database!, orgId, ownerId, "owner@test.com", {
      email: "invitee@test.com",
      role: "admin",
    });

    const { invite: accepted, org } = await acceptInvite(database!, invite.token, {
      userId: "user_new",
      email: "invitee@test.com",
    });

    expect(accepted?.status).toBe("accepted");
    expect(org?.id).toBe(orgId);

    const members = await listMembers(database!, orgId);
    const newMember = members.find((m) => m.userId === "user_new");
    expect(newMember?.role).toBe("admin");
  });

  it("rejects accepting an invite with a mismatched email", async () => {
    const invite = await createInvite(database!, orgId, ownerId, "owner@test.com", {
      email: "invitee@test.com",
      role: "member",
    });

    await expect(
      acceptInvite(database!, invite.token, {
        userId: "user_new",
        email: "someone-else@test.com",
      }),
    ).rejects.toThrow(/different email/i);
  });

  it("rejects accepting an unknown token", async () => {
    await expect(
      acceptInvite(database!, "not-a-real-token", {
        userId: "user_new",
        email: "invitee@test.com",
      }),
    ).rejects.toThrow(AppError);
  });

  it("rejects accepting an already-accepted invite", async () => {
    const invite = await createInvite(database!, orgId, ownerId, "owner@test.com", {
      email: "invitee@test.com",
      role: "member",
    });
    await acceptInvite(database!, invite.token, {
      userId: "user_new",
      email: "invitee@test.com",
    });

    await expect(
      acceptInvite(database!, invite.token, {
        userId: "user_another",
        email: "invitee@test.com",
      }),
    ).rejects.toThrow(/no longer valid/i);
  });

  it("rejects accepting an expired invite and marks it expired", async () => {
    const invite = await createInvite(database!, orgId, ownerId, "owner@test.com", {
      email: "invitee@test.com",
      role: "member",
    });
    await database!.execute(
      sql`update invites set expires_at = now() - interval '1 hour' where id = ${invite.id}`,
    );

    await expect(
      acceptInvite(database!, invite.token, {
        userId: "user_new",
        email: "invitee@test.com",
      }),
    ).rejects.toThrow(/expired/i);

    const pending = await listPendingInvites(database!, orgId);
    expect(pending).toHaveLength(0);
  });
});

import { beforeEach, describe, expect, it } from "vitest";

import { organizations } from "@/db/schema";
import { AppError } from "@/lib/errors";
import {
  createPolicy,
  deletePolicy,
  listPolicies,
  updatePolicy,
} from "@/lib/services/policies";
import { testDb, truncateAll } from "@/lib/services/test-db";

const database = testDb();
const describeIfDb = database ? describe : describe.skip;

describeIfDb("policies service (integration)", () => {
  let orgId: string;

  beforeEach(async () => {
    if (!database) return;
    await truncateAll(database);
    const [org] = await database
      .insert(organizations)
      .values({ name: "Test Org", slug: `test-org-${Date.now()}-${Math.random()}` })
      .returning();
    orgId = org!.id;
  });

  it("creates and lists a policy ordered by priority", async () => {
    await createPolicy(database!, orgId, {
      name: "low priority",
      actionTypePattern: "*",
      targetPattern: "*",
      minRiskLevel: "low",
      decision: "allow",
      priority: 200,
      enabled: true,
    });
    await createPolicy(database!, orgId, {
      name: "high priority",
      actionTypePattern: "*",
      targetPattern: "*",
      minRiskLevel: "low",
      decision: "deny",
      priority: 10,
      enabled: true,
    });

    const list = await listPolicies(database!, orgId);
    expect(list).toHaveLength(2);
    expect(list[0]?.name).toBe("high priority");
  });

  it("scopes policies to their organization", async () => {
    const [otherOrg] = await database!
      .insert(organizations)
      .values({ name: "Other Org", slug: `other-org-${Date.now()}` })
      .returning();

    await createPolicy(database!, orgId, {
      name: "org a policy",
      actionTypePattern: "*",
      targetPattern: "*",
      minRiskLevel: "low",
      decision: "allow",
      priority: 100,
      enabled: true,
    });

    const otherOrgPolicies = await listPolicies(database!, otherOrg!.id);
    expect(otherOrgPolicies).toHaveLength(0);
  });

  it("updates a policy's fields", async () => {
    const policy = await createPolicy(database!, orgId, {
      name: "original",
      actionTypePattern: "*",
      targetPattern: "*",
      minRiskLevel: "low",
      decision: "allow",
      priority: 100,
      enabled: true,
    });

    const updated = await updatePolicy(database!, orgId, policy.id, {
      name: "renamed",
      enabled: false,
    });

    expect(updated?.name).toBe("renamed");
    expect(updated?.enabled).toBe(false);
  });

  it("throws AppError when updating a policy in another org", async () => {
    const [otherOrg] = await database!
      .insert(organizations)
      .values({ name: "Other Org", slug: `other-org-${Date.now()}-b` })
      .returning();
    const policy = await createPolicy(database!, orgId, {
      name: "original",
      actionTypePattern: "*",
      targetPattern: "*",
      minRiskLevel: "low",
      decision: "allow",
      priority: 100,
      enabled: true,
    });

    await expect(
      updatePolicy(database!, otherOrg!.id, policy.id, { name: "hijacked" }),
    ).rejects.toThrow(AppError);
  });

  it("deletes a policy", async () => {
    const policy = await createPolicy(database!, orgId, {
      name: "to delete",
      actionTypePattern: "*",
      targetPattern: "*",
      minRiskLevel: "low",
      decision: "allow",
      priority: 100,
      enabled: true,
    });

    await deletePolicy(database!, orgId, policy.id);

    const list = await listPolicies(database!, orgId);
    expect(list).toHaveLength(0);
  });

  it("throws AppError when deleting a nonexistent policy", async () => {
    await expect(
      deletePolicy(database!, orgId, "00000000-0000-0000-0000-000000000000"),
    ).rejects.toThrow(AppError);
  });
});

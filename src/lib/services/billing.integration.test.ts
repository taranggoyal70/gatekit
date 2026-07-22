import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { organizations } from "@/db/schema";
import {
  activateSubscription,
  deactivateSubscription,
  getSubscription,
  syncSubscriptionStatus,
} from "@/lib/services/billing";
import { testDb, truncateAll } from "@/lib/services/test-db";

const database = testDb();
const describeIfDb = database ? describe : describe.skip;

describeIfDb("billing service (integration)", () => {
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

  it("activating a subscription bumps the org's planTier", async () => {
    await activateSubscription(database!, {
      orgId,
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      plan: "pro",
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const [org] = await database!
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId));
    expect(org?.planTier).toBe("pro");

    const subscription = await getSubscription(database!, orgId);
    expect(subscription?.status).toBe("active");
    expect(subscription?.stripeSubscriptionId).toBe("sub_1");
  });

  it("re-activating (checkout re-run) replaces the existing subscription row rather than duplicating", async () => {
    await activateSubscription(database!, {
      orgId,
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      plan: "pro",
      currentPeriodEnd: null,
    });
    await activateSubscription(database!, {
      orgId,
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_2",
      plan: "pro",
      currentPeriodEnd: null,
    });

    const subscription = await getSubscription(database!, orgId);
    expect(subscription?.stripeSubscriptionId).toBe("sub_2");
  });

  it("syncs status without changing the plan", async () => {
    await activateSubscription(database!, {
      orgId,
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      plan: "pro",
      currentPeriodEnd: null,
    });

    await syncSubscriptionStatus(database!, "sub_1", {
      status: "past_due",
      currentPeriodEnd: null,
    });

    const subscription = await getSubscription(database!, orgId);
    expect(subscription?.status).toBe("past_due");
    expect(subscription?.plan).toBe("pro");
  });

  it("deactivating a subscription reverts the org to the free plan", async () => {
    await activateSubscription(database!, {
      orgId,
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      plan: "pro",
      currentPeriodEnd: null,
    });

    await deactivateSubscription(database!, "sub_1");

    const [org] = await database!
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId));
    expect(org?.planTier).toBe("free");

    const subscription = await getSubscription(database!, orgId);
    expect(subscription?.status).toBe("cancelled");
  });

  it("is a no-op when deactivating an unknown subscription id", async () => {
    await expect(deactivateSubscription(database!, "sub_does_not_exist")).resolves.toBeUndefined();
  });

  it("returns null for an org with no subscription", async () => {
    expect(await getSubscription(database!, orgId)).toBeNull();
  });
});

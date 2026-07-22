import "server-only";

import { eq } from "drizzle-orm";

import { organizations, subscriptions } from "@/db/schema";
import { AppError } from "@/lib/errors";
import type { Database } from "@/lib/services/types";

export async function getSubscription(database: Database, orgId: string) {
  const [subscription] = await database
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.orgId, orgId))
    .limit(1);
  return subscription ?? null;
}

export async function getSubscriptionByStripeId(
  database: Database,
  stripeSubscriptionId: string,
) {
  const [subscription] = await database
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
    .limit(1);
  return subscription ?? null;
}

/**
 * Called from the checkout.session.completed webhook. Creates or replaces
 * the org's subscription row and bumps organizations.planTier so every
 * plan-limit check (agents, members) reads a plain column instead of
 * joining to Stripe state on every request.
 */
export async function activateSubscription(
  database: Database,
  input: {
    orgId: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    plan: string;
    currentPeriodEnd: Date | null;
  },
) {
  await database
    .insert(subscriptions)
    .values({
      orgId: input.orgId,
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      plan: input.plan,
      status: "active",
      currentPeriodEnd: input.currentPeriodEnd,
    })
    .onConflictDoUpdate({
      target: subscriptions.orgId,
      set: {
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        plan: input.plan,
        status: "active",
        currentPeriodEnd: input.currentPeriodEnd,
        updatedAt: new Date(),
      },
    });

  await database
    .update(organizations)
    .set({ planTier: input.plan, updatedAt: new Date() })
    .where(eq(organizations.id, input.orgId));
}

/** Called from customer.subscription.updated — status/renewal-date changes
 * that don't change which plan the org is on. */
export async function syncSubscriptionStatus(
  database: Database,
  stripeSubscriptionId: string,
  input: { status: "active" | "inactive" | "cancelled" | "past_due"; currentPeriodEnd: Date | null },
) {
  const subscription = await getSubscriptionByStripeId(database, stripeSubscriptionId);
  if (!subscription) return;

  await database
    .update(subscriptions)
    .set({ status: input.status, currentPeriodEnd: input.currentPeriodEnd, updatedAt: new Date() })
    .where(eq(subscriptions.id, subscription.id));
}

/** Called from customer.subscription.deleted — the subscription is gone,
 * so the org drops back to the free plan rather than being stuck on
 * whatever paid tier it last had. */
export async function deactivateSubscription(database: Database, stripeSubscriptionId: string) {
  const subscription = await getSubscriptionByStripeId(database, stripeSubscriptionId);
  if (!subscription) return;

  await database
    .update(subscriptions)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(subscriptions.id, subscription.id));

  await database
    .update(organizations)
    .set({ planTier: "free", updatedAt: new Date() })
    .where(eq(organizations.id, subscription.orgId));
}

export async function requireStripeCustomerId(database: Database, orgId: string): Promise<string> {
  const subscription = await getSubscription(database, orgId);
  if (!subscription) {
    throw new AppError("This organization has no billing history yet.", 404, "no_subscription");
  }
  return subscription.stripeCustomerId;
}

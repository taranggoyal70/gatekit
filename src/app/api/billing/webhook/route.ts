import { db } from "@/db/client";
import {
  activateSubscription,
  deactivateSubscription,
  syncSubscriptionStatus,
} from "@/lib/services/billing";
import { stripe } from "@/lib/stripe";

function mapSubscriptionStatus(
  stripeStatus: string,
): "active" | "inactive" | "cancelled" | "past_due" {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "cancelled";
    default:
      return "inactive";
  }
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return Response.json({ error: "Missing signature or webhook secret." }, { status: 400 });
  }

  const body = await request.text();
  let event;
  try {
    event = stripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }

  const database = db();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const orgId = session.metadata?.orgId ?? session.client_reference_id;
      if (!orgId || !session.subscription || !session.customer) break;

      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription.id;
      const subscription = await stripe().subscriptions.retrieve(subscriptionId);
      const currentPeriodEndRaw = (subscription as unknown as { current_period_end?: number })
        .current_period_end;

      await activateSubscription(database, {
        orgId,
        stripeCustomerId:
          typeof session.customer === "string" ? session.customer : session.customer.id,
        stripeSubscriptionId: subscriptionId,
        plan: "pro",
        currentPeriodEnd: currentPeriodEndRaw ? new Date(currentPeriodEndRaw * 1000) : null,
      });
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object;
      const currentPeriodEndRaw = (subscription as unknown as { current_period_end?: number })
        .current_period_end;
      await syncSubscriptionStatus(database, subscription.id, {
        status: mapSubscriptionStatus(subscription.status),
        currentPeriodEnd: currentPeriodEndRaw ? new Date(currentPeriodEndRaw * 1000) : null,
      });
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      await deactivateSubscription(database, subscription.id);
      break;
    }
  }

  return Response.json({ received: true });
}

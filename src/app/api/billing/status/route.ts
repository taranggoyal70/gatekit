import { db } from "@/db/client";
import { requireOrgContext } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { getPlanLimits } from "@/lib/plan-limits";
import { getSubscription } from "@/lib/services/billing";
import { PRO_PRICE_ID } from "@/lib/stripe";

export async function GET() {
  try {
    const { org } = await requireOrgContext();
    const subscription = await getSubscription(db(), org.id);
    return Response.json({
      plan: org.planTier,
      limits: getPlanLimits(org.planTier),
      // Lets the dashboard hide/relabel the upgrade button instead of
      // letting the user click it and see a raw "not configured" error —
      // that reads as broken, not as "not launched yet".
      upgradeAvailable: Boolean(PRO_PRICE_ID),
      subscription: subscription
        ? {
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
          }
        : null,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

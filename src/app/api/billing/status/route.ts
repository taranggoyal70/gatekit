import { db } from "@/db/client";
import { requireOrgContext } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { getPlanLimits } from "@/lib/plan-limits";
import { getSubscription } from "@/lib/services/billing";

export async function GET() {
  try {
    const { org } = await requireOrgContext();
    const subscription = await getSubscription(db(), org.id);
    return Response.json({
      plan: org.planTier,
      limits: getPlanLimits(org.planTier),
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

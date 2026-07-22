import { db } from "@/db/client";
import { requireOrgContext, requireOrgRole } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { requireStripeCustomerId } from "@/lib/services/billing";
import { stripe } from "@/lib/stripe";

export async function POST() {
  try {
    const { org, user } = await requireOrgContext();
    await requireOrgRole(user.userId, org.id, "owner");

    const customerId = await requireStripeCustomerId(db(), org.id);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

    const session = await stripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${siteUrl}/settings`,
    });

    return Response.json({ url: session.url });
  } catch (error) {
    return toErrorResponse(error);
  }
}

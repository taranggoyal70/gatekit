import { requireOrgContext, requireOrgRole } from "@/lib/auth";
import { toErrorResponse, AppError } from "@/lib/errors";
import { PRO_PRICE_ID, stripe } from "@/lib/stripe";

export async function POST() {
  try {
    const { org, user } = await requireOrgContext();
    await requireOrgRole(user.userId, org.id, "owner");

    if (!PRO_PRICE_ID) {
      throw new AppError("Billing is not configured.", 503, "not_configured");
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: PRO_PRICE_ID, quantity: 1 }],
      success_url: `${siteUrl}/settings?billing=success`,
      cancel_url: `${siteUrl}/settings?billing=cancelled`,
      client_reference_id: org.id,
      metadata: { orgId: org.id },
    });

    return Response.json({ url: session.url });
  } catch (error) {
    return toErrorResponse(error);
  }
}

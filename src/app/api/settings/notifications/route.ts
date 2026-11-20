import { db } from "@/db/client";
import { requireOrgContext, requireOrgRole } from "@/lib/auth";
import { readJsonBody, toErrorResponse } from "@/lib/errors";
import {
  getNotificationSettings,
  setSlackWebhook,
  slackWebhookInputSchema,
} from "@/lib/services/notification-settings";

export async function GET() {
  try {
    const { org } = await requireOrgContext();
    const settings = await getNotificationSettings(db(), org.id);
    return Response.json({
      slackWebhookUrl: settings?.slackWebhookUrl ?? null,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { org, user } = await requireOrgContext();
    await requireOrgRole(user.userId, org.id, "admin");
    const raw = await readJsonBody(request);
    const { slackWebhookUrl } = slackWebhookInputSchema.parse(raw);
    const settings = await setSlackWebhook(db(), org.id, slackWebhookUrl);
    return Response.json({ slackWebhookUrl: settings?.slackWebhookUrl ?? null });
  } catch (error) {
    return toErrorResponse(error);
  }
}

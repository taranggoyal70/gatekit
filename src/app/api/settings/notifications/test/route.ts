import { db } from "@/db/client";
import { requireOrgContext, requireOrgRole } from "@/lib/auth";
import { AppError, toErrorResponse } from "@/lib/errors";
import { getNotificationSettings } from "@/lib/services/notification-settings";
import { sendSlackTestMessage } from "@/lib/slack";

export async function POST() {
  try {
    const { org, user } = await requireOrgContext();
    await requireOrgRole(user.userId, org.id, "admin");

    const settings = await getNotificationSettings(db(), org.id);
    if (!settings?.slackWebhookUrl) {
      throw new AppError("No Slack webhook is configured yet.", 400, "not_configured");
    }

    await sendSlackTestMessage(settings.slackWebhookUrl);
    return Response.json({ sent: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

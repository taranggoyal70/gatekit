import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { notificationSettings } from "@/db/schema";
import type { Database } from "@/lib/services/types";

// Our server POSTs blindly to this URL on every pending approval — without
// restricting it to Slack's own domain, this field would be an open SSRF
// relay (an org admin could point it at an internal service and have
// Gatekit's server make requests to it on their behalf).
const SLACK_WEBHOOK_PATTERN = /^https:\/\/hooks\.slack\.com\/services\/.+/;

export const slackWebhookInputSchema = z.object({
  slackWebhookUrl: z
    .union([
      z.literal(""),
      z.string().regex(SLACK_WEBHOOK_PATTERN, "Must be a Slack incoming webhook URL (https://hooks.slack.com/services/...)."),
    ])
    .nullable(),
});

export async function getNotificationSettings(database: Database, orgId: string) {
  const [settings] = await database
    .select()
    .from(notificationSettings)
    .where(eq(notificationSettings.orgId, orgId))
    .limit(1);
  return settings ?? null;
}

export async function setSlackWebhook(
  database: Database,
  orgId: string,
  slackWebhookUrl: string | null,
) {
  const normalized = slackWebhookUrl?.trim() || null;

  const [settings] = await database
    .insert(notificationSettings)
    .values({ orgId, slackWebhookUrl: normalized })
    .onConflictDoUpdate({
      target: notificationSettings.orgId,
      set: { slackWebhookUrl: normalized, updatedAt: new Date() },
    })
    .returning();
  return settings;
}

import { beforeEach, describe, expect, it } from "vitest";

import { organizations } from "@/db/schema";
import {
  getNotificationSettings,
  setSlackWebhook,
} from "@/lib/services/notification-settings";
import { testDb, truncateAll } from "@/lib/services/test-db";

const database = testDb();
const describeIfDb = database ? describe : describe.skip;

describeIfDb("notification settings service (integration)", () => {
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

  it("returns null when no settings exist yet", async () => {
    expect(await getNotificationSettings(database!, orgId)).toBeNull();
  });

  it("sets and retrieves a webhook URL", async () => {
    await setSlackWebhook(
      database!,
      orgId,
      "https://hooks.slack.com/services/T00/B00/xxxxxxxx",
    );
    const settings = await getNotificationSettings(database!, orgId);
    expect(settings?.slackWebhookUrl).toBe("https://hooks.slack.com/services/T00/B00/xxxxxxxx");
  });

  it("upserts rather than duplicating on a second set", async () => {
    await setSlackWebhook(database!, orgId, "https://hooks.slack.com/services/A");
    await setSlackWebhook(database!, orgId, "https://hooks.slack.com/services/B");
    const settings = await getNotificationSettings(database!, orgId);
    expect(settings?.slackWebhookUrl).toBe("https://hooks.slack.com/services/B");
  });

  it("clears the webhook when set to null", async () => {
    await setSlackWebhook(database!, orgId, "https://hooks.slack.com/services/A");
    await setSlackWebhook(database!, orgId, null);
    const settings = await getNotificationSettings(database!, orgId);
    expect(settings?.slackWebhookUrl).toBeNull();
  });

  it("trims whitespace and treats a blank string as clearing the webhook", async () => {
    await setSlackWebhook(database!, orgId, "https://hooks.slack.com/services/A");
    await setSlackWebhook(database!, orgId, "   ");
    const settings = await getNotificationSettings(database!, orgId);
    expect(settings?.slackWebhookUrl).toBeNull();
  });
});

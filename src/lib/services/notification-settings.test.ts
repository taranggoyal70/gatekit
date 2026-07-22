import { describe, expect, it } from "vitest";

import { slackWebhookInputSchema } from "./notification-settings";

describe("slackWebhookInputSchema", () => {
  it("accepts a real-shaped Slack incoming webhook URL", () => {
    const result = slackWebhookInputSchema.safeParse({
      slackWebhookUrl: "https://hooks.slack.com/services/T00/B00/xxxxxxxx",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null to clear the webhook", () => {
    expect(slackWebhookInputSchema.safeParse({ slackWebhookUrl: null }).success).toBe(true);
  });

  it("accepts an empty string to clear the webhook", () => {
    expect(slackWebhookInputSchema.safeParse({ slackWebhookUrl: "" }).success).toBe(true);
  });

  it("rejects a non-Slack HTTPS URL — this field is POSTed to blindly, so it must not become an open relay", () => {
    const result = slackWebhookInputSchema.safeParse({
      slackWebhookUrl: "https://internal.example.com/some-endpoint",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a plain HTTP Slack-looking URL", () => {
    const result = slackWebhookInputSchema.safeParse({
      slackWebhookUrl: "http://hooks.slack.com/services/T00/B00/xxxxxxxx",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a URL that merely contains the Slack hostname as a path segment (bypass attempt)", () => {
    const result = slackWebhookInputSchema.safeParse({
      slackWebhookUrl: "https://evil.example.com/hooks.slack.com/services/foo",
    });
    expect(result.success).toBe(false);
  });
});

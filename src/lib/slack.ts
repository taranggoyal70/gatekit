import type { Action } from "@/db/schema";

/**
 * Fire-and-forget notification when an action is held for approval. Mirrors
 * the email notification's failure policy: a Slack outage must never fail
 * the evaluate() call — the action is already correctly recorded as
 * pending regardless of whether anyone gets pinged about it.
 */
export async function sendSlackApprovalNotification(
  webhookUrl: string,
  action: Action,
  siteUrl: string,
): Promise<void> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `Approval needed: *${action.actionType}* on \`${action.target}\``,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: [
                `:warning: *Approval needed*`,
                `*Action:* ${action.actionType}`,
                `*Target:* ${action.target}`,
                `*Risk level:* ${action.riskLevel}`,
                `<${siteUrl}/approvals|Review it in Gatekit>`,
              ].join("\n"),
            },
          },
        ],
      }),
    });
    if (!response.ok) {
      console.error("Slack webhook returned a non-OK status", response.status);
    }
  } catch (error) {
    console.error("Failed to send Slack approval notification", error);
  }
}

/**
 * Unlike the approval notification, a failed test message IS something the
 * caller needs to know about — that's the entire point of a "send test
 * message" button — so this throws instead of swallowing the error.
 */
export async function sendSlackTestMessage(webhookUrl: string): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "This is a test notification from Gatekit. If you can see this, your Slack webhook is configured correctly.",
    }),
  });
  if (!response.ok) {
    throw new Error(`Slack rejected the test message (status ${response.status}).`);
  }
}

import "server-only";

/**
 * Resolves Clerk user IDs to display-friendly emails for the dashboard —
 * the org_members table only stores the bare Clerk userId (it's what
 * policies/audit/approval records key against), so anywhere a user list is
 * rendered needs this lookup or the UI shows raw "user_xxxxx" strings
 * instead of a name a team owner would recognize.
 */
export async function resolveUserEmails(userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const result: Record<string, string> = {};
  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    await Promise.all(
      userIds.map(async (userId) => {
        try {
          const user = await client.users.getUser(userId);
          const email = user.primaryEmailAddress?.emailAddress;
          if (email) result[userId] = email;
        } catch (error) {
          console.error("Failed to resolve email for user", userId, error);
        }
      }),
    );
  } catch (error) {
    console.error("Failed to resolve user emails", error);
  }
  return result;
}

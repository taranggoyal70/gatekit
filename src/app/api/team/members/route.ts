import { db } from "@/db/client";
import { requireOrgContext } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { listMembers } from "@/lib/services/team";
import { resolveUserEmails } from "@/lib/user-directory";

export async function GET() {
  try {
    const { org } = await requireOrgContext();
    const members = await listMembers(db(), org.id);
    const emails = await resolveUserEmails(members.map((m) => m.userId));
    return Response.json({
      members: members.map((member) => ({
        ...member,
        email: emails[member.userId] ?? null,
      })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

import { db } from "@/db/client";
import { requireOrgContext, requireOrgRole } from "@/lib/auth";
import { parseId, toErrorResponse } from "@/lib/errors";
import { revokeInvite } from "@/lib/services/invites";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ inviteId: string }> },
) {
  try {
    const { org, user } = await requireOrgContext();
    await requireOrgRole(user.userId, org.id, "admin");
    const inviteId = parseId((await context.params).inviteId, "Invite");
    const invite = await revokeInvite(db(), org.id, inviteId);
    return Response.json({ invite });
  } catch (error) {
    return toErrorResponse(error);
  }
}

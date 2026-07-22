import { db } from "@/db/client";
import { requireOrgContext, requireOrgRole } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { createInvite, inviteInputSchema, listPendingInvites } from "@/lib/services/invites";

export async function GET() {
  try {
    const { org } = await requireOrgContext();
    const invites = await listPendingInvites(db(), org.id);
    return Response.json({ invites });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { org, user } = await requireOrgContext();
    await requireOrgRole(user.userId, org.id, "admin");
    const raw = await request.json();
    const input = inviteInputSchema.parse(raw);
    const invite = await createInvite(db(), org.id, user.userId, user.email, input);
    return Response.json({ invite }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

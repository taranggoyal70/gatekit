import { z } from "zod";

import { db } from "@/db/client";
import { requireOrgContext, requireOrgRole } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { removeMember, updateMemberRole } from "@/lib/services/team";

const roleUpdateSchema = z.object({
  role: z.enum(["owner", "admin", "member"]),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ memberId: string }> },
) {
  try {
    const { org, user } = await requireOrgContext();
    await requireOrgRole(user.userId, org.id, "admin");
    const { memberId } = await context.params;
    const raw = await request.json();
    const { role } = roleUpdateSchema.parse(raw);
    const member = await updateMemberRole(db(), org.id, memberId, role);
    return Response.json({ member });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ memberId: string }> },
) {
  try {
    const { org, user } = await requireOrgContext();
    await requireOrgRole(user.userId, org.id, "admin");
    const { memberId } = await context.params;
    await removeMember(db(), org.id, memberId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

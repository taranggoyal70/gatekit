import { db } from "@/db/client";
import { requireOrgContext } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { listMembers } from "@/lib/services/team";

export async function GET() {
  try {
    const { org } = await requireOrgContext();
    const members = await listMembers(db(), org.id);
    return Response.json({ members });
  } catch (error) {
    return toErrorResponse(error);
  }
}

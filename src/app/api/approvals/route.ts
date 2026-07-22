import { db } from "@/db/client";
import { requireOrgContext } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { listPendingApprovals } from "@/lib/services/approvals";

export async function GET() {
  try {
    const { org } = await requireOrgContext();
    const pending = await listPendingApprovals(db(), org.id);
    return Response.json({ pending });
  } catch (error) {
    return toErrorResponse(error);
  }
}

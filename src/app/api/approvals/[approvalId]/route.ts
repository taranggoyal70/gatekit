import { db } from "@/db/client";
import { requireOrgContext } from "@/lib/auth";
import { parseId, readJsonBody, toErrorResponse } from "@/lib/errors";
import { approvalDecisionSchema, decideApproval } from "@/lib/services/approvals";

export async function POST(
  request: Request,
  context: { params: Promise<{ approvalId: string }> },
) {
  try {
    const { org, user } = await requireOrgContext();
    const approvalId = parseId((await context.params).approvalId, "Approval");
    const raw = await readJsonBody(request);
    const input = approvalDecisionSchema.parse(raw);
    const result = await decideApproval(db(), org.id, approvalId, user.userId, input);
    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

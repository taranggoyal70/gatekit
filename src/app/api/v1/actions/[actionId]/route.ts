import { authenticateAgent } from "@/lib/agent-auth";
import { db } from "@/db/client";
import { parseId, toErrorResponse } from "@/lib/errors";
import { getActionStatus, expirePastDueApprovals } from "@/lib/services/actions";

export async function GET(
  request: Request,
  context: { params: Promise<{ actionId: string }> },
) {
  try {
    const agent = await authenticateAgent(request);
    const actionId = parseId((await context.params).actionId, "Action");
    const database = db();
    await expirePastDueApprovals(database, agent.orgId);
    const { action, approval } = await getActionStatus(database, agent.orgId, actionId);

    return Response.json({
      actionId: action.id,
      decision: action.decision,
      status: action.status,
      approval: approval
        ? { id: approval.id, status: approval.status, reason: approval.reason }
        : null,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

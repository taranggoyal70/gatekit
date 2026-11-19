import { db } from "@/db/client";
import { requireOrgContext } from "@/lib/auth";
import { parseId, toErrorResponse } from "@/lib/errors";
import { revokeAgent } from "@/lib/services/agents";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    const { org } = await requireOrgContext();
    const agentId = parseId((await context.params).agentId, "Agent");
    const agent = await revokeAgent(db(), org.id, agentId);
    return Response.json({ agent });
  } catch (error) {
    return toErrorResponse(error);
  }
}

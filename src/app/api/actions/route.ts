import { db } from "@/db/client";
import { requireOrgContext } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { actionListFiltersSchema, listActions } from "@/lib/services/actions";

export async function GET(request: Request) {
  try {
    const { org } = await requireOrgContext();
    const params = new URL(request.url).searchParams;
    const filters = actionListFiltersSchema.parse({
      status: params.get("status") ?? undefined,
      agentId: params.get("agentId") ?? undefined,
      cursor: params.get("cursor") ?? undefined,
      limit: params.get("limit") ?? undefined,
    });
    const actions = await listActions(db(), org.id, filters);
    return Response.json({ actions });
  } catch (error) {
    return toErrorResponse(error);
  }
}

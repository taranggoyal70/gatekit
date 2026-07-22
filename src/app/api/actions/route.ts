import { db } from "@/db/client";
import { requireOrgContext } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { listActions } from "@/lib/services/actions";

export async function GET(request: Request) {
  try {
    const { org } = await requireOrgContext();
    const url = new URL(request.url);
    const actions = await listActions(db(), org.id, {
      status: url.searchParams.get("status") ?? undefined,
      agentId: url.searchParams.get("agentId") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit")
        ? Number(url.searchParams.get("limit"))
        : undefined,
    });
    return Response.json({ actions });
  } catch (error) {
    return toErrorResponse(error);
  }
}

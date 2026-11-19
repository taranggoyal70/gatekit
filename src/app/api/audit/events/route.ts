import { z } from "zod";

import { db } from "@/db/client";
import { requireOrgContext } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { listAuditEvents } from "@/lib/services/audit";

const querySchema = z.object({
  afterSeq: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

/** The org's hash-chained audit events, oldest first, paged by `afterSeq`. */
export async function GET(request: Request) {
  try {
    const { org } = await requireOrgContext();
    const params = new URL(request.url).searchParams;
    const query = querySchema.parse({
      afterSeq: params.get("afterSeq") ?? undefined,
      limit: params.get("limit") ?? undefined,
    });
    const events = await listAuditEvents(db(), org.id, query);
    return Response.json({ events });
  } catch (error) {
    return toErrorResponse(error);
  }
}

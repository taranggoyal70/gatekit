import { z } from "zod";

import { db } from "@/db/client";
import { requireOrgContext } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { createAgent, listAgents } from "@/lib/services/agents";

const createAgentSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
});

export async function GET() {
  try {
    const { org } = await requireOrgContext();
    const agents = await listAgents(db(), org.id);
    return Response.json({ agents });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { org } = await requireOrgContext();
    const raw = await request.json();
    const input = createAgentSchema.parse(raw);
    const { agent, plaintextKey } = await createAgent(db(), org.id, input);
    return Response.json({ agent, key: plaintextKey }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

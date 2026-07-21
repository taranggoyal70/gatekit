import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { agents } from "@/db/schema";
import { generateAgentKey, hashAgentKey, keyDisplayPrefix } from "@/lib/agent-keys";
import { AppError } from "@/lib/errors";
import type { Database } from "@/lib/services/types";

const FREE_TIER_AGENT_LIMIT = 20;

export async function listAgents(database: Database, orgId: string) {
  return database
    .select()
    .from(agents)
    .where(and(eq(agents.orgId, orgId), isNull(agents.revokedAt)))
    .orderBy(desc(agents.createdAt));
}

export async function createAgent(
  database: Database,
  orgId: string,
  input: { name: string; description?: string },
) {
  const existing = await listAgents(database, orgId);
  if (existing.length >= FREE_TIER_AGENT_LIMIT) {
    throw new AppError(
      `You've reached the limit of ${FREE_TIER_AGENT_LIMIT} agents on this plan.`,
      403,
      "limit_reached",
    );
  }

  const plaintextKey = generateAgentKey();
  const keyHash = await hashAgentKey(plaintextKey);

  const [agent] = await database
    .insert(agents)
    .values({
      orgId,
      name: input.name,
      description: input.description ?? null,
      keyHash,
      keyPrefix: keyDisplayPrefix(plaintextKey),
    })
    .returning();

  if (!agent) throw new AppError("Failed to create agent.", 500, "internal_error");

  return { agent, plaintextKey };
}

export async function revokeAgent(database: Database, orgId: string, agentId: string) {
  const [agent] = await database
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.orgId, orgId)))
    .limit(1);
  if (!agent) throw new AppError("Agent not found.", 404, "not_found");
  if (agent.revokedAt) return agent;

  const [updated] = await database
    .update(agents)
    .set({ revokedAt: new Date() })
    .where(eq(agents.id, agentId))
    .returning();
  return updated;
}

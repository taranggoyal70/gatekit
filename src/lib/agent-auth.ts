import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { agents } from "@/db/schema";
import { hashAgentKey } from "@/lib/agent-keys";
import { AppError } from "@/lib/errors";

export type AuthedAgent = {
  id: string;
  orgId: string;
  name: string;
};

export async function authenticateAgent(request: Request): Promise<AuthedAgent> {
  const header = request.headers.get("authorization");
  const key = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!key) {
    throw new AppError(
      "Missing Authorization header. Use: Authorization: Bearer <agent-key>.",
      401,
      "unauthorized",
    );
  }

  const keyHash = await hashAgentKey(key);
  const database = db();
  const [agent] = await database
    .select()
    .from(agents)
    .where(eq(agents.keyHash, keyHash))
    .limit(1);

  if (!agent) {
    throw new AppError("Invalid agent key.", 401, "unauthorized");
  }
  if (agent.revokedAt) {
    throw new AppError("This agent key has been revoked.", 401, "revoked");
  }

  // Best-effort last-seen bump; never let this fail the request.
  void database
    .update(agents)
    .set({ lastSeenAt: new Date() })
    .where(eq(agents.id, agent.id))
    .catch((error) => console.error("Failed to update agent lastSeenAt", error));

  return { id: agent.id, orgId: agent.orgId, name: agent.name };
}

import { beforeEach, describe, expect, it } from "vitest";

import { organizations } from "@/db/schema";
import { AGENT_KEY_PREFIX, hashAgentKey } from "@/lib/agent-keys";
import { createAgent, listAgents, revokeAgent } from "@/lib/services/agents";
import { testDb, truncateAll } from "@/lib/services/test-db";

const database = testDb();
const describeIfDb = database ? describe : describe.skip;

describeIfDb("agents service (integration)", () => {
  let orgId: string;

  beforeEach(async () => {
    if (!database) return;
    await truncateAll(database);
    const [org] = await database
      .insert(organizations)
      .values({ name: "Test Org", slug: `test-org-${Date.now()}-${Math.random()}` })
      .returning();
    orgId = org!.id;
  });

  it("creates an agent and returns a plaintext key that hashes to the stored hash", async () => {
    const { agent, plaintextKey } = await createAgent(database!, orgId, {
      name: "support-bot",
    });

    expect(plaintextKey.startsWith(AGENT_KEY_PREFIX)).toBe(true);
    expect(agent.keyHash).toBe(await hashAgentKey(plaintextKey));
    expect(agent.name).toBe("support-bot");
  });

  it("lists only non-revoked agents", async () => {
    const { agent: keep } = await createAgent(database!, orgId, { name: "keep" });
    const { agent: revoke } = await createAgent(database!, orgId, { name: "revoke-me" });

    await revokeAgent(database!, orgId, revoke.id);

    const list = await listAgents(database!, orgId);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(keep.id);
  });

  it("enforces the agent limit per organization", async () => {
    for (let i = 0; i < 20; i += 1) {
      await createAgent(database!, orgId, { name: `agent-${i}` });
    }

    await expect(createAgent(database!, orgId, { name: "one-too-many" })).rejects.toThrow(
      /limit/,
    );
  });

  it("is idempotent when revoking an already-revoked agent", async () => {
    const { agent } = await createAgent(database!, orgId, { name: "test" });
    const first = await revokeAgent(database!, orgId, agent.id);
    const second = await revokeAgent(database!, orgId, agent.id);
    expect(first?.revokedAt).toEqual(second?.revokedAt);
  });
});

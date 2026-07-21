import { describe, expect, it } from "vitest";

import {
  AGENT_KEY_PREFIX,
  generateAgentKey,
  hashAgentKey,
  keyDisplayPrefix,
} from "./agent-keys";

describe("generateAgentKey", () => {
  it("produces a key with the expected prefix", () => {
    expect(generateAgentKey().startsWith(AGENT_KEY_PREFIX)).toBe(true);
  });

  it("produces distinct keys on each call", () => {
    const a = generateAgentKey();
    const b = generateAgentKey();
    expect(a).not.toBe(b);
  });
});

describe("keyDisplayPrefix", () => {
  it("truncates to the prefix plus a few characters", () => {
    const key = generateAgentKey();
    const displayed = keyDisplayPrefix(key);
    expect(displayed.length).toBe(AGENT_KEY_PREFIX.length + 6);
    expect(key.startsWith(displayed)).toBe(true);
  });
});

describe("hashAgentKey", () => {
  it("is deterministic for the same input", async () => {
    const key = generateAgentKey();
    const first = await hashAgentKey(key);
    const second = await hashAgentKey(key);
    expect(first).toBe(second);
  });

  it("produces different hashes for different keys", async () => {
    const a = await hashAgentKey(generateAgentKey());
    const b = await hashAgentKey(generateAgentKey());
    expect(a).not.toBe(b);
  });

  it("produces a 64-character hex digest (SHA-256)", async () => {
    const hash = await hashAgentKey(generateAgentKey());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

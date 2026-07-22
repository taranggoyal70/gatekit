import { describe, expect, it } from "vitest";

import { generateInviteToken } from "./invite-tokens";

describe("generateInviteToken", () => {
  it("produces a 32-character token", () => {
    expect(generateInviteToken()).toHaveLength(32);
  });

  it("produces distinct tokens on each call", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).not.toBe(b);
  });
});

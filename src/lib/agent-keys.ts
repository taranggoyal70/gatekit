import { customAlphabet } from "nanoid";

const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const nanoid = customAlphabet(ALPHABET, 40);

export const AGENT_KEY_PREFIX = "gk_live_";

/** Generates a new plaintext agent API key. Only ever returned once, at creation. */
export function generateAgentKey(): string {
  return `${AGENT_KEY_PREFIX}${nanoid()}`;
}

/** The short, non-secret prefix stored alongside the hash for display ("gk_live_AB12..."). */
export function keyDisplayPrefix(key: string): string {
  return key.slice(0, AGENT_KEY_PREFIX.length + 6);
}

export async function hashAgentKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Buffer.from(digest).toString("hex");
}

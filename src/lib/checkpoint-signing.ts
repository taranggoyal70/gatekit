import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";

import { canonicalJson } from "@/lib/audit-chain";

/**
 * Signed audit checkpoints.
 *
 * A checkpoint is the head of an organization's audit chain at one moment.
 * Unsigned, it only helps whoever saved it. Signed with an Ed25519 key that
 * the database never sees, it becomes evidence anyone can check offline with
 * the public key: someone who can rewrite `audit_events` (and recompute every
 * hash) still cannot produce a checkpoint that vouches for the rewritten head.
 *
 * The private key comes from GATEKIT_CHECKPOINT_SIGNING_KEY (a PKCS#8 PEM, or
 * its base64 DER). Without it, verification still works; checkpoints are just
 * unsigned. Keys held in a KMS would remove the key from the app's memory too.
 */

export const CHECKPOINT_VERSION = "gatekit-checkpoint-v1";

export type Checkpoint = {
  version: typeof CHECKPOINT_VERSION;
  orgId: string;
  seq: number;
  hash: string;
  signedAt: string;
};

export type SignedCheckpoint = Checkpoint & {
  algorithm: "Ed25519";
  keyId: string;
  signature: string;
};

/** The exact bytes that are signed: canonical JSON of the checkpoint fields. */
export function checkpointMessage(checkpoint: Checkpoint): Buffer {
  const { version, orgId, seq, hash, signedAt } = checkpoint;
  return Buffer.from(canonicalJson({ version, orgId, seq, hash, signedAt }), "utf8");
}

/** First 16 hex characters of SHA-256 over the public key's SPKI DER. */
export function keyIdOf(publicKey: KeyObject): string {
  const der = publicKey.export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex").slice(0, 16);
}

/** The public half of an Ed25519 private key. */
export function publicKeyOf(privateKey: KeyObject): KeyObject {
  return createPublicKey(privateKey.export({ type: "pkcs8", format: "pem" }));
}

export function parsePrivateKey(raw: string): KeyObject {
  const text = raw.trim();
  const key = text.startsWith("-----BEGIN")
    ? createPrivateKey(text)
    : createPrivateKey({ key: Buffer.from(text, "base64"), format: "der", type: "pkcs8" });
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error("GATEKIT_CHECKPOINT_SIGNING_KEY must be an Ed25519 private key.");
  }
  return key;
}

export function signCheckpoint(checkpoint: Checkpoint, privateKey: KeyObject): SignedCheckpoint {
  const publicKey = publicKeyOf(privateKey);
  return {
    ...checkpoint,
    algorithm: "Ed25519",
    keyId: keyIdOf(publicKey),
    signature: sign(null, checkpointMessage(checkpoint), privateKey).toString("base64"),
  };
}

export function verifyCheckpointSignature(signed: SignedCheckpoint, publicKey: KeyObject): boolean {
  if (signed.version !== CHECKPOINT_VERSION || signed.algorithm !== "Ed25519") return false;
  if (signed.keyId !== keyIdOf(publicKey)) return false;
  try {
    return verify(null, checkpointMessage(signed), publicKey, Buffer.from(signed.signature, "base64"));
  } catch {
    return false;
  }
}

let cached: { raw: string; key: KeyObject } | null = null;

/** The configured signing key, or null when checkpoint signing is off. */
export function configuredSigningKey(): KeyObject | null {
  const raw = process.env.GATEKIT_CHECKPOINT_SIGNING_KEY;
  if (!raw) return null;
  if (cached?.raw !== raw) cached = { raw, key: parsePrivateKey(raw) };
  return cached.key;
}

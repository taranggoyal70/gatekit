import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  CHECKPOINT_VERSION,
  keyIdOf,
  parsePrivateKey,
  publicKeyOf,
  signCheckpoint,
  verifyCheckpointSignature,
  type Checkpoint,
} from "./checkpoint-signing";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");

const checkpoint: Checkpoint = {
  version: CHECKPOINT_VERSION,
  orgId: "8d4f7a52-6a3e-4f43-9c1b-0c6f3d0e2a11",
  seq: 61,
  hash: "0dd6788cf9ed564db12547af823e2239a17a0406348d567651c6b2f3a731b34e",
  signedAt: "2026-11-19T23:32:43.000Z",
};

describe("checkpoint signing", () => {
  it("round-trips: a signed checkpoint verifies with the matching public key", () => {
    const signed = signCheckpoint(checkpoint, privateKey);
    expect(signed.algorithm).toBe("Ed25519");
    expect(signed.keyId).toBe(keyIdOf(publicKey));
    expect(verifyCheckpointSignature(signed, publicKey)).toBe(true);
  });

  it.each([
    ["seq", { seq: 60 }],
    ["hash", { hash: "f".repeat(64) }],
    ["orgId", { orgId: "00000000-0000-4000-8000-000000000000" }],
    ["signedAt", { signedAt: "2026-11-20T00:00:00.000Z" }],
  ])("fails when %s is changed after signing", (_field, change) => {
    const signed = { ...signCheckpoint(checkpoint, privateKey), ...change };
    expect(verifyCheckpointSignature(signed, publicKey)).toBe(false);
  });

  it("fails under a different key", () => {
    const other = generateKeyPairSync("ed25519");
    const signed = signCheckpoint(checkpoint, other.privateKey);
    expect(verifyCheckpointSignature(signed, publicKey)).toBe(false);
  });

  it("fails on a garbled signature instead of throwing", () => {
    const signed = { ...signCheckpoint(checkpoint, privateKey), signature: "not base64 at all" };
    expect(verifyCheckpointSignature(signed, publicKey)).toBe(false);
  });

  it("accepts the key as PEM or as base64 DER, and rejects non-Ed25519 keys", () => {
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const der = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
    expect(keyIdOf(publicKeyOf(parsePrivateKey(pem)))).toBe(keyIdOf(publicKey));
    expect(keyIdOf(publicKeyOf(parsePrivateKey(der)))).toBe(keyIdOf(publicKey));
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
    expect(() => parsePrivateKey(rsa.privateKey.export({ type: "pkcs8", format: "pem" }).toString())).toThrow(
      /Ed25519/,
    );
  });
});

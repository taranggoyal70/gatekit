/**
 * Verify a signed Gatekit audit checkpoint offline.
 *
 *   pnpm audit:verify-checkpoint <checkpoint.json> <public-key.pem>
 *
 * checkpoint.json is the `signedCheckpoint` object from GET /api/audit/verify
 * (or the Audit log page's "Copy checkpoint"); the PEM is `publicKey` from
 * GET /api/audit/public-key. Exits 0 if the signature is valid, 1 otherwise.
 */
import { createPublicKey } from "node:crypto";
import { readFileSync } from "node:fs";

import { verifyCheckpointSignature, type SignedCheckpoint } from "../src/lib/checkpoint-signing";

const [checkpointPath, publicKeyPath] = process.argv.slice(2);
if (!checkpointPath || !publicKeyPath) {
  console.error("Usage: pnpm audit:verify-checkpoint <checkpoint.json> <public-key.pem>");
  process.exit(2);
}

const signed = JSON.parse(readFileSync(checkpointPath, "utf8")) as SignedCheckpoint;
const publicKey = createPublicKey(readFileSync(publicKeyPath, "utf8"));

if (verifyCheckpointSignature(signed, publicKey)) {
  console.log(`Valid: org ${signed.orgId}, event #${signed.seq}, hash ${signed.hash}, signed ${signed.signedAt} by key ${signed.keyId}.`);
} else {
  console.error("INVALID: the signature does not match this checkpoint and public key.");
  process.exit(1);
}

import { z } from "zod";

import { db } from "@/db/client";
import { requireOrgContext } from "@/lib/auth";
import { CHECKPOINT_VERSION, configuredSigningKey, signCheckpoint } from "@/lib/checkpoint-signing";
import { AppError, toErrorResponse } from "@/lib/errors";
import { verifyOrgAudit } from "@/lib/services/audit";

const querySchema = z.object({
  checkpointSeq: z.coerce.number().int().min(1).optional(),
  checkpointHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/, "Must be a 64-character lowercase hex SHA-256.")
    .optional(),
});

/**
 * Recompute the org's audit chain and cross-check it against the actions
 * table. Pass a checkpoint you stored earlier (`checkpointSeq` +
 * `checkpointHash`, from a previous response's `chain.headSeq`/`headHash`)
 * to also detect truncation or a full rewrite since then. When a signing key
 * is configured and everything verified, `signedCheckpoint` carries the head
 * signed with it (see src/lib/checkpoint-signing.ts).
 */
export async function GET(request: Request) {
  try {
    const { org } = await requireOrgContext();
    const params = new URL(request.url).searchParams;
    const query = querySchema.parse({
      checkpointSeq: params.get("checkpointSeq") ?? undefined,
      checkpointHash: params.get("checkpointHash") ?? undefined,
    });
    if ((query.checkpointSeq === undefined) !== (query.checkpointHash === undefined)) {
      throw new AppError("Pass both checkpointSeq and checkpointHash, or neither.", 400, "bad_request");
    }
    const checkpoint =
      query.checkpointSeq !== undefined && query.checkpointHash !== undefined
        ? { seq: query.checkpointSeq, hash: query.checkpointHash }
        : undefined;
    const result = await verifyOrgAudit(db(), org.id, checkpoint);

    // Sign the head only when everything verified: a signature vouches for
    // the chain, so it must never be issued over a broken one.
    const signingKey = configuredSigningKey();
    const signedCheckpoint =
      signingKey && result.ok && result.chain.checked > 0
        ? signCheckpoint(
            {
              version: CHECKPOINT_VERSION,
              orgId: org.id,
              seq: result.chain.headSeq,
              hash: result.chain.headHash,
              signedAt: result.verifiedAt,
            },
            signingKey,
          )
        : null;

    return Response.json({ ...result, signedCheckpoint }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

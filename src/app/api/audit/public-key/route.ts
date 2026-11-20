import { configuredSigningKey, keyIdOf, publicKeyOf } from "@/lib/checkpoint-signing";
import { toErrorResponse } from "@/lib/errors";

/**
 * The public half of the checkpoint signing key, so a signed checkpoint can
 * be checked by anyone, offline, without trusting Gatekit's database.
 */
export async function GET() {
  try {
    const privateKey = configuredSigningKey();
    if (!privateKey) {
      return Response.json(
        { error: { message: "Checkpoint signing is not configured.", code: "not_configured" } },
        { status: 404 },
      );
    }
    const publicKey = publicKeyOf(privateKey);
    return Response.json(
      {
        algorithm: "Ed25519",
        keyId: keyIdOf(publicKey),
        publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
      },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

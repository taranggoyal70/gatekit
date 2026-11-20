import { z } from "zod";

export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = "bad_request") {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export function toErrorResponse(error: unknown, headers?: HeadersInit): Response {
  if (error instanceof AppError) {
    return Response.json(
      { error: { message: error.message, code: error.code } },
      { status: error.status, headers },
    );
  }
  if (error instanceof z.ZodError) {
    return Response.json(
      {
        error: {
          message: "Invalid request.",
          code: "validation_error",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      { status: 400, headers },
    );
  }
  console.error("Unhandled error", error);
  return Response.json(
    { error: { message: "Internal server error.", code: "internal_error" } },
    { status: 500, headers },
  );
}

const DEFAULT_MAX_BODY_BYTES = 64_000;

/**
 * Read a JSON request body with a hard size cap. Checking Content-Length
 * alone is not enough: a chunked request has none, so the cap is enforced on
 * the bytes actually read.
 */
export async function readJsonBody(
  request: Request,
  maxBytes = DEFAULT_MAX_BODY_BYTES,
): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new AppError("Request body is too large.", 413, "payload_too_large");
  }
  if (!request.body) throw new AppError("Request body must be valid JSON.", 400, "bad_request");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new AppError("Request body is too large.", 413, "payload_too_large");
    }
    chunks.push(value);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError("Request body must be valid JSON.", 400, "bad_request");
  }
}

const uuidSchema = z.uuid();

/**
 * Route params reach SQL as uuid columns; a malformed id would otherwise
 * surface as a Postgres cast error and a 500. Treat it as "not found".
 */
export function parseId(value: string, label: string): string {
  if (!uuidSchema.safeParse(value).success) {
    throw new AppError(`${label} not found.`, 404, "not_found");
  }
  return value;
}

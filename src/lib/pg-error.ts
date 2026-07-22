/**
 * Drizzle wraps the underlying postgres.js error in its own error type, so
 * the Postgres error code (e.g. "23505" for a unique-violation) usually
 * isn't on the caught error itself — it's on `.cause`. Walk the cause chain
 * rather than assuming either shape.
 */
export function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current === "object" && "code" in current) {
      const code = (current as { code?: unknown }).code;
      if (typeof code === "string") return code;
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return undefined;
}

export const PG_UNIQUE_VIOLATION = "23505";

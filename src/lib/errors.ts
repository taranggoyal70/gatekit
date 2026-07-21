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

export function toErrorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json(
      { error: { message: error.message, code: error.code } },
      { status: error.status },
    );
  }
  console.error("Unhandled error", error);
  return Response.json(
    { error: { message: "Internal server error.", code: "internal_error" } },
    { status: 500 },
  );
}

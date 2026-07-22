import { authenticateAgent } from "@/lib/agent-auth";
import { db } from "@/db/client";
import { AppError, toErrorResponse } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { evaluateAndRecordAction, evaluateInputSchema } from "@/lib/services/actions";

const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;
const MAX_BODY_BYTES = 20_000;

export async function POST(request: Request) {
  try {
    const agent = await authenticateAgent(request);

    const rate = checkRateLimit(`evaluate:${agent.id}`, RATE_LIMIT, RATE_WINDOW_MS);
    const rateHeaders = {
      "X-RateLimit-Limit": String(RATE_LIMIT),
      "X-RateLimit-Remaining": String(rate.remaining),
    };
    if (!rate.allowed) {
      return Response.json(
        { error: { message: "Too many requests.", code: "rate_limited" } },
        { status: 429, headers: { ...rateHeaders, "Retry-After": String(rate.retryAfterSeconds) } },
      );
    }

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      throw new AppError("Request body is too large.", 413, "payload_too_large");
    }

    const raw = await request.json().catch(() => {
      throw new AppError("Request body must be valid JSON.", 400, "bad_request");
    });
    const input = evaluateInputSchema.parse(raw);

    const { action, approval, reason } = await evaluateAndRecordAction(
      db(),
      agent.orgId,
      agent.id,
      input,
    );

    return Response.json(
      {
        actionId: action.id,
        decision: action.decision,
        status: action.status,
        reason,
        approvalId: approval?.id ?? null,
        expiresAt: approval?.expiresAt ?? null,
      },
      { headers: rateHeaders },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return Response.json(
        { error: { message: "Invalid request body.", code: "validation_error", details: error.message } },
        { status: 400 },
      );
    }
    return toErrorResponse(error);
  }
}

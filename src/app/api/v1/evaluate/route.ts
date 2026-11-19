import { authenticateAgent } from "@/lib/agent-auth";
import { db } from "@/db/client";
import { readJsonBody, toErrorResponse } from "@/lib/errors";
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

    const raw = await readJsonBody(request, MAX_BODY_BYTES);
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
    return toErrorResponse(error);
  }
}

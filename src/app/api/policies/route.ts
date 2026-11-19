import { db } from "@/db/client";
import { requireOrgContext } from "@/lib/auth";
import { readJsonBody, toErrorResponse } from "@/lib/errors";
import { createPolicy, listPolicies, policyInputSchema } from "@/lib/services/policies";

export async function GET() {
  try {
    const { org } = await requireOrgContext();
    const policies = await listPolicies(db(), org.id);
    return Response.json({ policies });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { org, user } = await requireOrgContext();
    const raw = await readJsonBody(request);
    const input = policyInputSchema.parse(raw);
    const policy = await createPolicy(db(), org.id, input, `user:${user.userId}`);
    return Response.json({ policy }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

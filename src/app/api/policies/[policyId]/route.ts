import { db } from "@/db/client";
import { requireOrgContext } from "@/lib/auth";
import { parseId, readJsonBody, toErrorResponse } from "@/lib/errors";
import { deletePolicy, policyPatchSchema, updatePolicy } from "@/lib/services/policies";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ policyId: string }> },
) {
  try {
    const { org, user } = await requireOrgContext();
    const policyId = parseId((await context.params).policyId, "Policy");
    const raw = await readJsonBody(request);
    const input = policyPatchSchema.parse(raw);
    const policy = await updatePolicy(db(), org.id, policyId, input, `user:${user.userId}`);
    return Response.json({ policy });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ policyId: string }> },
) {
  try {
    const { org, user } = await requireOrgContext();
    const policyId = parseId((await context.params).policyId, "Policy");
    await deletePolicy(db(), org.id, policyId, `user:${user.userId}`);
    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

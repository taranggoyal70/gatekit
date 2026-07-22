import { db } from "@/db/client";
import { requireOrgContext } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { deletePolicy, policyInputSchema, updatePolicy } from "@/lib/services/policies";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ policyId: string }> },
) {
  try {
    const { org } = await requireOrgContext();
    const { policyId } = await context.params;
    const raw = await request.json();
    const input = policyInputSchema.partial().parse(raw);
    const policy = await updatePolicy(db(), org.id, policyId, input);
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
    const { org } = await requireOrgContext();
    const { policyId } = await context.params;
    await deletePolicy(db(), org.id, policyId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

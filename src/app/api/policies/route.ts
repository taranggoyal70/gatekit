import { db } from "@/db/client";
import { assertOrgRole, hasOrgRole, requireOrgContext } from "@/lib/auth";
import { readJsonBody, toErrorResponse } from "@/lib/errors";
import { createPolicy, listPolicies, policyInputSchema } from "@/lib/services/policies";

export async function GET() {
  try {
    const { org, role } = await requireOrgContext();
    const policies = await listPolicies(db(), org.id);
    // Policies decide what agents may do, so only admins and owners change them.
    return Response.json({ policies, canEdit: hasOrgRole(role, "admin") });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { org, user, role } = await requireOrgContext();
    assertOrgRole(role, "admin");
    const raw = await readJsonBody(request);
    const input = policyInputSchema.parse(raw);
    const policy = await createPolicy(db(), org.id, input, `user:${user.userId}`);
    return Response.json({ policy }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

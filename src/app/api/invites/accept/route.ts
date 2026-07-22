import { z } from "zod";

import { db } from "@/db/client";
import { requireUser } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { acceptInvite } from "@/lib/services/invites";

const acceptSchema = z.object({ token: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const raw = await request.json();
    const { token } = acceptSchema.parse(raw);
    const result = await acceptInvite(db(), token, user);
    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

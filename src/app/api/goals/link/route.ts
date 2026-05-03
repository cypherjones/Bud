import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { linkTransactionToGoal, unlinkTransactionFromGoal } from "@/lib/actions/goals";
import { z } from "zod/v4";

const linkSchema = z.object({
  transactionId: z.string().min(1),
  goalId: z.string().min(1),
});

const unlinkSchema = z.object({
  transactionId: z.string().min(1),
});

export async function POST(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();
  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const body = await req.json();
  const parsed = linkSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 });

  const result = linkTransactionToGoal(parsed.data.transactionId, parsed.data.goalId);
  if (!result.success) return Response.json({ error: result.error }, { status: 400 });
  return Response.json(result);
}

export async function DELETE(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();
  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const body = await req.json();
  const parsed = unlinkSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 });

  const result = unlinkTransactionFromGoal(parsed.data.transactionId);
  if (!result.success) return Response.json({ error: result.error }, { status: 400 });
  return Response.json(result);
}

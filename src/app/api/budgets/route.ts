import { upsertBudget, deleteBudget } from "@/lib/actions/budget";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod/v4";

const upsertSchema = z.object({
  categoryId: z.string().min(1),
  amount: z.number().min(0), // dollars
});

const deleteSchema = z.object({
  budgetId: z.string().min(1),
});

export async function POST(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();

  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const body = await req.json();
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const amountCents = Math.round(parsed.data.amount * 100);
  const id = upsertBudget(parsed.data.categoryId, amountCents);

  return Response.json({ success: true, id });
}

export async function DELETE(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();

  const body = await req.json();
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  deleteBudget(parsed.data.budgetId);
  return Response.json({ success: true });
}

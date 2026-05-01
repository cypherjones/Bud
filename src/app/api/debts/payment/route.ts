import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { logDebtPayment } from "@/lib/actions/debts";
import { z } from "zod/v4";

const logSchema = z.object({
  debtId: z.string().min(1),
  amount: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  type: z.enum(["minimum", "extra", "lump_sum"]),
  notes: z.string().optional(),
  linkedTransactionId: z.string().min(1).nullable().optional(),
});

export async function POST(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();

  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const body = await req.json();
  const parsed = logSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
  }

  const result = logDebtPayment({
    ...parsed.data,
    linkedTransactionId: parsed.data.linkedTransactionId ?? null,
  });
  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json(result);
}

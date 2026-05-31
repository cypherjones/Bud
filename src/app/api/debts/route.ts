import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createDebt } from "@/lib/actions/debts";
import { z } from "zod/v4";

const createSchema = z.object({
  creditorName: z.string().min(1),
  type: z.enum([
    "credit_card",
    "personal_loan",
    "student_loan",
    "auto_loan",
    "medical",
    "tax_debt",
    "other",
  ]),
  originalBalance: z.number().positive(),
  currentBalance: z.number().nonnegative().optional(),
  interestRate: z.number().nonnegative(), // percent
  minimumPayment: z.number().nonnegative(),
  dueDay: z.number().int().min(1).max(31).optional(),
  creditLimit: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();

  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
  }

  const result = createDebt(parsed.data);
  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json(result);
}

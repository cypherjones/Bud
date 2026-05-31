import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { updateDebt, deleteDebt } from "@/lib/actions/debts";
import { z } from "zod/v4";

const updateSchema = z.object({
  creditorName: z.string().min(1).optional(),
  type: z.enum([
    "credit_card",
    "personal_loan",
    "student_loan",
    "auto_loan",
    "medical",
    "tax_debt",
    "other",
  ]).optional(),
  originalBalance: z.number().positive().optional(),
  currentBalance: z.number().nonnegative().optional(),
  interestRate: z.number().nonnegative().optional(),
  minimumPayment: z.number().nonnegative().optional(),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  creditLimit: z.number().nonnegative().nullable().optional(),
  status: z.enum(["active", "paid_off", "in_collections", "deferred"]).optional(),
  notes: z.string().nullable().optional(),
  nextActionDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  nextActionAmount: z.number().nonnegative().nullable().optional(),
  nextActionNote: z.string().nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!authenticateRequest(req)) return unauthorizedResponse();
  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
  }

  const result = updateDebt(id, parsed.data);
  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json(result);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!authenticateRequest(req)) return unauthorizedResponse();
  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const { id } = await params;
  const result = deleteDebt(id);
  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json(result);
}

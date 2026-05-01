import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createTaxObligation } from "@/lib/actions/taxes";
import { z } from "zod/v4";

const createSchema = z.object({
  type: z.enum([
    "federal_income",
    "state_income",
    "back_taxes",
    "estimated_quarterly",
    "penalty",
    "other",
  ]),
  taxYear: z.number().int(),
  originalAmount: z.number().positive(),
  remainingBalance: z.number().nonnegative().optional(),
  agency: z.string().min(1),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  isInstallmentPlan: z.boolean().optional(),
  installmentAmount: z.number().nonnegative().optional(),
  installmentDay: z.number().int().min(1).max(31).optional(),
  penaltyRate: z.number().nonnegative().optional(),
  referenceNumber: z.string().optional(),
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

  const result = createTaxObligation(parsed.data);
  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json(result);
}

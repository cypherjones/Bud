import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createCreditScore } from "@/lib/actions/credit";
import { z } from "zod/v4";

const factorsSchema = z.object({
  utilizationRatio: z.number().min(0).max(100).optional(),
  onTimePayments: z.number().int().min(0).optional(),
  totalAccounts: z.number().int().min(0).optional(),
  hardInquiries: z.number().int().min(0).optional(),
  oldestAccountMonths: z.number().int().min(0).optional(),
  derogatoryMarks: z.number().int().min(0).optional(),
  totalBalance: z.number().nonnegative().optional(),
  totalCreditLimit: z.number().nonnegative().optional(),
});

const createSchema = z.object({
  score: z.number().int().min(300).max(850),
  bureau: z.enum(["equifax", "experian", "transunion", "fico", "vantage"]).optional(),
  source: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().optional(),
  factors: factorsSchema.optional(),
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

  const result = createCreditScore(parsed.data);
  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json(result);
}

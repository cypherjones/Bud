import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { setSettlementBudget } from "@/lib/actions/credit-triage";
import { z } from "zod/v4";

const schema = z.object({
  budgetDollars: z.number().nonnegative(),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();
  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
  }
  const result = setSettlementBudget(parsed.data.budgetDollars, parsed.data.notes);
  if (!result.success) return Response.json({ error: result.error }, { status: 400 });
  return Response.json(result);
}

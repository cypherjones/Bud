import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createCreditItem } from "@/lib/actions/credit-triage";
import { z } from "zod/v4";

const createSchema = z.object({
  creditor: z.string().min(1),
  originalCreditor: z.string().optional(),
  accountLast4: z.string().optional(),
  category: z.enum(["active", "authorized_user", "charge_off", "collection"]),
  status: z.enum(["pay", "negotiate", "settle", "dispute", "settled", "removed", "ignore"]).optional(),
  balanceDollars: z.number().nonnegative(),
  firstDelinquencyDate: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  lastReportedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  moveRelevant: z.boolean().optional(),
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

  const result = createCreditItem(parsed.data);
  if (!result.success) return Response.json({ error: result.error }, { status: 400 });
  return Response.json(result);
}

import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { updateCreditItem, deleteCreditItem } from "@/lib/actions/credit-triage";
import { z } from "zod/v4";

const updateSchema = z.object({
  creditor: z.string().min(1).optional(),
  originalCreditor: z.string().nullable().optional(),
  accountLast4: z.string().nullable().optional(),
  category: z.enum(["active", "authorized_user", "charge_off", "collection"]).optional(),
  status: z.enum(["pay", "negotiate", "settle", "dispute", "settled", "removed", "ignore"]).optional(),
  balanceDollars: z.number().nonnegative().optional(),
  settlementOfferDollars: z.number().nonnegative().nullable().optional(),
  settledAmountDollars: z.number().nonnegative().nullable().optional(),
  firstDelinquencyDate: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional(),
  lastReportedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  moveRelevant: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!authenticateRequest(req)) return unauthorizedResponse();
  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
  }

  const result = updateCreditItem(id, parsed.data);
  if (!result.success) return Response.json({ error: result.error }, { status: 400 });
  return Response.json(result);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!authenticateRequest(req)) return unauthorizedResponse();
  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const { id } = await params;
  const result = deleteCreditItem(id);
  if (!result.success) return Response.json({ error: result.error }, { status: 400 });
  return Response.json(result);
}

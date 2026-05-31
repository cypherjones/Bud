import { setAutopayStatus } from "@/lib/actions/debts";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod/v4";

const schema = z.object({
  debtId: z.string().min(1),
  enabled: z.boolean(),
  note: z.string().optional(),
});

export async function POST(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();
  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  setAutopayStatus(parsed.data.debtId, parsed.data.enabled, parsed.data.note);
  return Response.json({ success: true });
}

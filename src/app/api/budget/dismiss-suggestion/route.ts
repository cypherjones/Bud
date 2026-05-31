import { dismissBudgetSuggestion } from "@/lib/actions/budget";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod/v4";

const schema = z.object({
  categoryId: z.string().min(1),
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

  dismissBudgetSuggestion(parsed.data.categoryId);
  return Response.json({ success: true });
}

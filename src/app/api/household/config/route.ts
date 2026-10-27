import { updateHouseholdConfig, householdConfigPatchSchema } from "@/lib/household/config";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { syncBudgetsFromPlan } from "@/lib/household/sync";

export async function PATCH(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();
  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const body = await req.json();
  const parsed = householdConfigPatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  const config = updateHouseholdConfig(parsed.data);
  // Income moves the tithe and savings budgets
  if (parsed.data.income) syncBudgetsFromPlan();
  return Response.json({ success: true, config });
}

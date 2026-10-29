import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { deleteSavingsGoal } from "@/lib/actions/goals";

export const runtime = "nodejs";

/** DELETE /api/goals?id=… — remove one savings goal. Used by "Old goals" on the Savings page. */
export async function DELETE(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();
  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const result = deleteSavingsGoal(id);
  if (!result.success) return Response.json({ error: result.error }, { status: 404 });
  return Response.json(result);
}

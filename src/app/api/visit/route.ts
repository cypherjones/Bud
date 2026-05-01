import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { markVisitNow } from "@/lib/actions/dashboard";

export async function POST(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();
  markVisitNow();
  return Response.json({ success: true });
}

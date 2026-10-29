import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { scenarioSchema, saveScenario, clearScenario, applyScenarioToPlan } from "@/lib/household/working";

/** Save the working budget as it stands. */
export async function PUT(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();
  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const parsed = scenarioSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  saveScenario(parsed.data);
  return Response.json({ success: true });
}

/** Apply the posted working budget to the real plan, then start the scratch copy over. */
export async function POST(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();
  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const parsed = scenarioSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  return Response.json({ success: true, ...applyScenarioToPlan(parsed.data) });
}

/** Throw the working budget away. */
export async function DELETE(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();
  clearScenario();
  return Response.json({ success: true });
}

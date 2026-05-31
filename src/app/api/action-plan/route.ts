import { createActionPlanItem, updateActionPlanItem, deleteActionPlanItem } from "@/lib/actions/action-plan";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod/v4";

const phase = z.enum(["now", "this_week", "this_month", "ongoing"]);
const status = z.enum(["pending", "in_progress", "completed", "skipped"]);

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  phase: phase.optional(),
  estimatedSavingsCents: z.number().int().min(0).optional(),
  link: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  status: status.optional(),
  notes: z.string().max(2000).optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  phase: phase.optional(),
});

const deleteSchema = z.object({
  id: z.string().min(1),
});

export async function POST(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();
  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  const id = createActionPlanItem(parsed.data);
  return Response.json({ success: true, id });
}

export async function PATCH(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();
  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  const { id, ...patch } = parsed.data;
  updateActionPlanItem(id, patch);
  return Response.json({ success: true });
}

export async function DELETE(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();
  const body = await req.json();
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }
  deleteActionPlanItem(parsed.data.id);
  return Response.json({ success: true });
}

import { createHouseholdLine, updateHouseholdLine, deleteHouseholdLine } from "@/lib/household/lines";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod/v4";

const owner = z.enum(["his", "hers", "both"]);
const amount = z.number().min(0).max(100_000); // dollars per month

const createSchema = z.object({
  groupName: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  amount,
  owner,
  note: z.string().max(500).optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  amount: amount.optional(),
  owner: owner.optional(),
  label: z.string().min(1).max(200).optional(),
  note: z.string().max(500).nullable().optional(),
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

  const id = createHouseholdLine(parsed.data);
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
  updateHouseholdLine(id, patch);
  return Response.json({ success: true });
}

export async function DELETE(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();
  const body = await req.json();
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }
  deleteHouseholdLine(parsed.data.id);
  return Response.json({ success: true });
}

import { getHiddenCategories, setHiddenCategories } from "@/lib/actions/budget";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod/v4";

const hideSchema = z.object({
  categoryName: z.string().min(1).max(100),
});

const unhideSchema = z.object({
  categoryName: z.string().min(1).max(100),
});

export async function POST(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();
  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const parsed = hideSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const current = new Set(getHiddenCategories());
  current.add(parsed.data.categoryName);
  setHiddenCategories([...current]);
  return Response.json({ success: true, hidden: [...current] });
}

export async function DELETE(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();

  const parsed = unhideSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const current = new Set(getHiddenCategories());
  current.delete(parsed.data.categoryName);
  setHiddenCategories([...current]);
  return Response.json({ success: true, hidden: [...current] });
}

import { db, schema } from "@/lib/db";
import { newId } from "@/lib/utils/ids";
import { now } from "@/lib/utils/format";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod/v4";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  icon: z.string().max(10).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export async function POST(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();

  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const { name, icon, color } = parsed.data;

  const id = newId();
  db.insert(schema.categories)
    .values({
      id,
      name,
      icon: icon ?? null,
      color: color ?? "#6b7280",
      isSystem: false,
      createdAt: now(),
    })
    .run();

  return Response.json({ id, name, icon, color });
}

import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { now } from "@/lib/utils/format";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod/v4";

const earmarkSchema = z.object({
  earmarks: z.array(
    z.object({
      label: z.string().min(1).max(80),
      dollars: z.number().nonnegative(),
    }),
  ),
});

export async function POST(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();
  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const body = await req.json();
  const parsed = earmarkSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
  }

  // Persist to settings.move_savings_earmarks as JSON. Cents-stored to match
  // every other money field in the database.
  const value = JSON.stringify(
    parsed.data.earmarks.map((e) => ({
      label: e.label.trim(),
      cents: Math.round(e.dollars * 100),
    })),
  );
  const timestamp = now();
  const existing = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "move_savings_earmarks"))
    .get();
  if (existing) {
    db.update(schema.settings)
      .set({ value, updatedAt: timestamp })
      .where(eq(schema.settings.key, "move_savings_earmarks"))
      .run();
  } else {
    db.insert(schema.settings)
      .values({ key: "move_savings_earmarks", value, updatedAt: timestamp })
      .run();
  }
  return Response.json({ success: true });
}

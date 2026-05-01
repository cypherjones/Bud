import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { newId } from "@/lib/utils/ids";
import { now } from "@/lib/utils/format";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod/v4";

const addTagSchema = z.object({
  transactionId: z.string().min(1),
  tagName: z.string().min(1).max(50),
});

const removeTagSchema = z.object({
  transactionId: z.string().min(1),
  tagId: z.string().min(1),
});

/** GET: List all tags */
export async function GET(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();

  const tags = db.select().from(schema.tags).all();
  return Response.json({ tags });
}

/** POST: Add a tag to a transaction (creates tag if it doesn't exist) */
export async function POST(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();

  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const body = await req.json();
  const parsed = addTagSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const { transactionId, tagName } = parsed.data;
  const normalizedName = tagName.toLowerCase().replace(/^#/, "").trim();

  // Find or create the tag
  let tag = db.select().from(schema.tags).where(eq(schema.tags.name, normalizedName)).get();
  if (!tag) {
    const id = newId();
    db.insert(schema.tags).values({ id, name: normalizedName, createdAt: now() }).run();
    tag = { id, name: normalizedName, color: "#6b7280", createdAt: now() };
  }

  // Check if already tagged
  const existing = db
    .select()
    .from(schema.transactionTags)
    .where(
      and(
        eq(schema.transactionTags.transactionId, transactionId),
        eq(schema.transactionTags.tagId, tag.id),
      )
    )
    .get();

  if (!existing) {
    try {
      db.insert(schema.transactionTags)
        .values({ id: newId(), transactionId, tagId: tag.id, createdAt: now() })
        .run();
    } catch {
      // Ignore duplicate insert
    }
  }

  return Response.json({ success: true, tag });
}

/** DELETE: Remove a tag from a transaction */
export async function DELETE(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();

  const body = await req.json();
  const parsed = removeTagSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const { transactionId, tagId } = parsed.data;

  db.delete(schema.transactionTags)
    .where(
      and(
        eq(schema.transactionTags.transactionId, transactionId),
        eq(schema.transactionTags.tagId, tagId),
      )
    )
    .run();

  return Response.json({ success: true });
}

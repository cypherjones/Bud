import { db, schema } from "@/lib/db";
import { eq, and, like, or } from "drizzle-orm";
import { newId } from "@/lib/utils/ids";
import { now } from "@/lib/utils/format";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { z } from "zod/v4";

const toggleSchema = z.object({
  merchant: z.string().min(1),
  tagName: z.string().min(1),
  action: z.enum(["add", "remove"]).optional(), // explicit action, or toggle if omitted
});

export async function POST(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();

  const body = await req.json();
  const parsed = toggleSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const { merchant, tagName, action } = parsed.data;

  // Find or create tag
  let tag = db.select().from(schema.tags).where(eq(schema.tags.name, tagName)).get();
  if (!tag) {
    const id = newId();
    db.insert(schema.tags).values({ id, name: tagName, color: "#dc2626", createdAt: now() }).run();
    tag = { id, name: tagName, color: "#dc2626", createdAt: now() };
  }

  // Find transactions — match merchant name or description containing the merchant string
  // Use exact match first, fall back to LIKE
  let txns = db
    .select({ id: schema.transactions.id })
    .from(schema.transactions)
    .where(eq(schema.transactions.merchant, merchant))
    .all();

  if (txns.length === 0) {
    // Try case-insensitive LIKE but be specific — require word boundary
    txns = db
      .select({ id: schema.transactions.id })
      .from(schema.transactions)
      .where(
        or(
          like(schema.transactions.merchant, `${merchant}%`),
          like(schema.transactions.merchant, `% ${merchant}%`),
        )
      )
      .all();
  }

  if (txns.length === 0) {
    return Response.json({ error: "No transactions found" }, { status: 404 });
  }

  // Determine action: explicit or auto-detect
  let shouldAdd: boolean;
  if (action) {
    shouldAdd = action === "add";
  } else {
    // Count how many already have the tag
    const taggedCount = txns.filter((tx) => {
      return db
        .select()
        .from(schema.transactionTags)
        .where(
          and(
            eq(schema.transactionTags.transactionId, tx.id),
            eq(schema.transactionTags.tagId, tag.id),
          )
        )
        .get();
    }).length;
    // If majority are tagged, remove. Otherwise add.
    shouldAdd = taggedCount < txns.length / 2;
  }

  if (shouldAdd) {
    for (const tx of txns) {
      try {
        db.insert(schema.transactionTags)
          .values({ id: newId(), transactionId: tx.id, tagId: tag.id, createdAt: now() })
          .run();
      } catch { /* ignore duplicates */ }
    }
    return Response.json({ success: true, action: "added", count: txns.length });
  } else {
    for (const tx of txns) {
      db.delete(schema.transactionTags)
        .where(
          and(
            eq(schema.transactionTags.transactionId, tx.id),
            eq(schema.transactionTags.tagId, tag.id),
          )
        )
        .run();
    }
    return Response.json({ success: true, action: "removed", count: txns.length });
  }
}

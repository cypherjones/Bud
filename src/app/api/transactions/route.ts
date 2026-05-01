import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createTransaction } from "@/lib/actions/transactions";
import { z } from "zod/v4";

const updateSchema = z.object({
  id: z.string().min(1),
  categoryId: z.string().min(1),
});

const createSchema = z.object({
  accountId: z.string().min(1),
  amount: z.number().positive(),
  type: z.enum(["income", "expense"]),
  description: z.string().min(1),
  merchant: z.string().optional(),
  categoryId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  placeholder: z.boolean().optional(),
  placeholderTtlDays: z.number().int().positive().max(60).optional(),
});

export async function POST(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();

  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
  }

  const result = createTransaction(parsed.data);
  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json(result);
}

export async function PATCH(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();

  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const { id, categoryId } = parsed.data;

  const tx = db.select().from(schema.transactions).where(eq(schema.transactions.id, id)).get();
  if (!tx) {
    return Response.json({ error: "Transaction not found" }, { status: 404 });
  }

  db.update(schema.transactions)
    .set({ categoryId })
    .where(eq(schema.transactions.id, id))
    .run();

  return Response.json({ success: true });
}

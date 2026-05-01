import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { findMatchingTransaction } from "@/lib/actions/debts";

export async function GET(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();

  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const { searchParams } = new URL(req.url);
  const debtId = searchParams.get("debtId");
  const amount = searchParams.get("amount");
  const date = searchParams.get("date");

  if (!debtId || !amount || !date) {
    return Response.json({ error: "debtId, amount, date are required" }, { status: 400 });
  }
  const amountNum = parseFloat(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return Response.json({ error: "amount must be a positive number" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const debt = db.select().from(schema.debts).where(eq(schema.debts.id, debtId)).get();
  if (!debt) return Response.json({ error: "Debt not found" }, { status: 404 });

  const match = findMatchingTransaction(debt, amountNum, date);
  return Response.json({ match });
}

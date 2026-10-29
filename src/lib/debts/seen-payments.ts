import { db, schema } from "@/lib/db";
import { and, eq, gt, inArray, isNotNull, like, or } from "drizzle-orm";
import { newId } from "@/lib/utils/ids";
import { now } from "@/lib/utils/format";

/**
 * Loan payments the bank has seen but nobody logged. The car loans were paid
 * every month from 360 Checking while their balances sat at the May numbers,
 * which made Debts and Credit six months stale.
 *
 * Only installment loans: a fixed payment to a named lender is unambiguous.
 * Card payments vary and their lenders' names show up on transfers too.
 * Each payment's interest since the previous one is estimated from the APR,
 * so the balance moves by principal, not by the whole payment.
 */
const INSTALLMENT = ["auto_loan", "personal_loan", "student_loan", "mortgage"];

/** "Bridgecrest (VW)" → "bridgecrest". */
const lenderKey = (name: string) => name.replace(/\(.*?\)/g, "").trim().split(/\s+/)[0].toLowerCase();

export function logSeenDebtPayments(): number {
  const debts = db
    .select()
    .from(schema.debts)
    .where(and(eq(schema.debts.status, "active"), inArray(schema.debts.type, INSTALLMENT)))
    .all()
    .filter((d) => d.currentBalance > 0 && d.minimumPayment > 0 && lenderKey(d.creditorName).length >= 5);
  if (debts.length === 0) return 0;

  const linked = new Set(
    db
      .select({ id: schema.debtPayments.linkedTransactionId })
      .from(schema.debtPayments)
      .where(isNotNull(schema.debtPayments.linkedTransactionId))
      .all()
      .map((r) => r.id!),
  );

  const byLender = new Map<string, typeof debts>();
  for (const d of debts) byLender.set(lenderKey(d.creditorName), [...(byLender.get(lenderKey(d.creditorName)) ?? []), d]);

  // Where each debt's balance was last known: its last logged payment, or its last edit.
  const balance = new Map(debts.map((d) => [d.id, d.currentBalance]));
  const anchor = new Map<string, string>();
  for (const d of debts) {
    const last = db
      .select({ date: schema.debtPayments.date })
      .from(schema.debtPayments)
      .where(eq(schema.debtPayments.debtId, d.id))
      .all()
      .reduce((m, p) => (p.date > m ? p.date : m), "");
    anchor.set(d.id, [last, d.updatedAt.slice(0, 10)].sort().pop()!);
  }

  let logged = 0;
  for (const [key, group] of byLender) {
    const since = group.map((d) => anchor.get(d.id)!).sort()[0];
    const txs = db
      .select()
      .from(schema.transactions)
      .where(
        and(
          eq(schema.transactions.type, "expense"),
          gt(schema.transactions.date, since),
          or(like(schema.transactions.merchant, `%${key}%`), like(schema.transactions.description, `%${key}%`)),
        ),
      )
      .all()
      .filter((t) => !linked.has(t.id))
      .sort((a, b) => a.date.localeCompare(b.date));

    for (const t of txs) {
      // Two loans with one lender: the payment belongs to the one whose minimum it's closest to.
      const debt = group
        .filter((d) => t.date > anchor.get(d.id)!)
        .sort((a, b) => Math.abs(Math.log(t.amount / a.minimumPayment)) - Math.abs(Math.log(t.amount / b.minimumPayment)))[0];
      if (!debt || t.amount < debt.minimumPayment * 0.4 || t.amount > debt.minimumPayment * 3) continue;

      const before = balance.get(debt.id)!;
      const days = Math.max(0, (Date.parse(t.date) - Date.parse(anchor.get(debt.id)!)) / 86_400_000);
      const interest = Math.round((before * (debt.interestRate ?? 0) * days) / 365);
      const principal = Math.max(0, t.amount - interest);
      const after = Math.max(0, before - principal);

      db.insert(schema.debtPayments)
        .values({
          id: newId(),
          debtId: debt.id,
          amount: t.amount,
          date: t.date,
          type: t.amount > debt.minimumPayment * 1.05 ? "extra" : "minimum",
          newBalance: after,
          notes: `Seen in the bank. About $${(interest / 100).toFixed(2)} of it interest (estimated from the APR).`,
          linkedTransactionId: t.id,
          createdAt: now(),
        })
        .run();
      // updatedAt is left alone: it marks the last balance someone typed in, which anchors this.
      db.update(schema.debts)
        .set({ currentBalance: after, status: after === 0 ? "paid_off" : debt.status })
        .where(eq(schema.debts.id, debt.id))
        .run();
      balance.set(debt.id, after);
      anchor.set(debt.id, t.date);
      logged++;
    }
  }
  return logged;
}

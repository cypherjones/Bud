import { db, schema } from "@/lib/db";
import { eq, and, gte, lte } from "drizzle-orm";
import { newId } from "@/lib/utils/ids";
import { now, today, parseDollarsToCents } from "@/lib/utils/format";
import { calculateDebtAllocation } from "@/lib/utils/debt-engine";

// ============================================================
// LOG PAYMENT
// ============================================================

export type LogDebtPaymentInput = {
  debtId: string;
  amount: number; // dollars (positive)
  date?: string; // ISO YYYY-MM-DD; defaults today
  type: "minimum" | "extra" | "lump_sum";
  notes?: string;
  linkedTransactionId?: string | null;
};

export type LogDebtPaymentResult =
  | { success: true; paymentId: string; newBalance: number; paidOff: boolean }
  | { success: false; error: string };

export function logDebtPayment(input: LogDebtPaymentInput): LogDebtPaymentResult {
  if (!input.debtId) return { success: false, error: "debtId is required" };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { success: false, error: "amount must be a positive number" };
  }
  if (!["minimum", "extra", "lump_sum"].includes(input.type)) {
    return { success: false, error: "type must be 'minimum', 'extra', or 'lump_sum'" };
  }

  const debt = db.select().from(schema.debts).where(eq(schema.debts.id, input.debtId)).get();
  if (!debt) return { success: false, error: `Debt ${input.debtId} not found` };

  const amountCents = parseDollarsToCents(input.amount);
  const newBalance = Math.max(0, debt.currentBalance - amountCents);
  const paidOff = newBalance === 0;
  const date = input.date ?? today();
  const timestamp = now();
  const paymentId = newId();

  // Validate linked transaction id if provided (must exist)
  let linkedTransactionId: string | null = null;
  if (input.linkedTransactionId) {
    const tx = db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, input.linkedTransactionId))
      .get();
    if (!tx) {
      return { success: false, error: `Linked transaction ${input.linkedTransactionId} not found` };
    }
    linkedTransactionId = tx.id;
  }

  db.insert(schema.debtPayments)
    .values({
      id: paymentId,
      debtId: debt.id,
      amount: amountCents,
      date,
      type: input.type,
      newBalance,
      notes: input.notes?.trim() || null,
      linkedTransactionId,
      createdAt: timestamp,
    })
    .run();

  db.update(schema.debts)
    .set({
      currentBalance: newBalance,
      status: paidOff ? "paid_off" : debt.status,
      updatedAt: timestamp,
    })
    .where(eq(schema.debts.id, debt.id))
    .run();

  return { success: true, paymentId, newBalance, paidOff };
}

// ============================================================
// MATCH PAYMENT TO TELLER TRANSACTION
// ============================================================

export type TransactionMatch = {
  id: string;
  date: string;
  amount: number; // cents
  description: string;
  merchant: string | null;
  accountId: string | null;
  bankTransactionId: string | null;
};

/**
 * Find the best Teller-synced transaction to link to a debt payment.
 * Uses the M1 brief's tolerance: ±7 days, ±1% of amount, creditor name as
 * substring of merchant or description (case-insensitive).
 *
 * Pure read function. Returns null if no candidate is found.
 */
export function findMatchingTransaction(
  debt: { creditorName: string },
  amountDollars: number,
  date: string,
): TransactionMatch | null {
  const amountCents = parseDollarsToCents(amountDollars);
  const tolerance = Math.max(100, Math.round(amountCents * 0.01)); // 1% or $1, whichever larger
  const minAmount = amountCents - tolerance;
  const maxAmount = amountCents + tolerance;

  const targetDate = new Date(date);
  const startDate = new Date(targetDate);
  startDate.setDate(startDate.getDate() - 7);
  const endDate = new Date(targetDate);
  endDate.setDate(endDate.getDate() + 7);

  const candidates = db
    .select({
      id: schema.transactions.id,
      date: schema.transactions.date,
      amount: schema.transactions.amount,
      description: schema.transactions.description,
      merchant: schema.transactions.merchant,
      accountId: schema.transactions.accountId,
      bankTransactionId: schema.transactions.bankTransactionId,
    })
    .from(schema.transactions)
    .where(and(
      eq(schema.transactions.type, "expense"),
      gte(schema.transactions.date, startDate.toISOString().split("T")[0]),
      lte(schema.transactions.date, endDate.toISOString().split("T")[0]),
    ))
    .all();

  // Build creditor tokens for fuzzy matching: split on whitespace, drop short tokens
  const creditorTokens = debt.creditorName
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter((t) => t.length >= 3);

  const matches = candidates
    .filter((c) => c.amount >= minAmount && c.amount <= maxAmount)
    .filter((c) => {
      const haystack = `${c.merchant ?? ""} ${c.description}`.toLowerCase();
      return creditorTokens.some((t) => haystack.includes(t));
    });

  if (matches.length === 0) return null;

  // Prefer the closest by date, then closest by amount
  matches.sort((a, b) => {
    const aDelta = Math.abs(new Date(a.date).getTime() - targetDate.getTime());
    const bDelta = Math.abs(new Date(b.date).getTime() - targetDate.getTime());
    if (aDelta !== bDelta) return aDelta - bDelta;
    return Math.abs(a.amount - amountCents) - Math.abs(b.amount - amountCents);
  });

  return matches[0];
}

// ============================================================
// MONTHLY ALLOCATION VS ACTUAL
// ============================================================

export type AllocationVsActualRow = {
  debtId: string;
  creditorName: string;
  recommended: number; // cents
  actualPaid: number; // cents
  paymentCount: number;
  status: "ahead" | "on_track" | "behind" | "no_plan";
};

export type AllocationVsActualSummary = {
  month: string; // YYYY-MM
  totalRecommended: number;
  totalActual: number;
  rows: AllocationVsActualRow[];
};

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(month: string): { start: string; end: string } {
  const [year, mon] = month.split("-").map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const end = `${month}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

/**
 * For the given month (defaults to current), return per-debt and aggregate
 * "recommended vs actual paid." If no debtAllocations rows exist for the
 * current month, snap them by recomputing from calculateDebtAllocation and
 * persisting — so the AI, dashboard, and debts page all agree.
 */
export function getMonthlyAllocationVsActual(month?: string): AllocationVsActualSummary {
  const mon = month ?? thisMonth();
  const { start, end } = monthBounds(mon);

  const activeDebts = db
    .select()
    .from(schema.debts)
    .where(eq(schema.debts.status, "active"))
    .all();

  // Snap allocations for the current month if none exist yet
  let allocations = db
    .select()
    .from(schema.debtAllocations)
    .where(eq(schema.debtAllocations.month, mon))
    .all();

  if (allocations.length === 0 && activeDebts.length > 0 && mon === thisMonth()) {
    const totalMinimums = activeDebts.reduce((s, d) => s + d.minimumPayment, 0);
    const movePlan = db
      .select()
      .from(schema.financialPlans)
      .where(eq(schema.financialPlans.type, "move"))
      .get();

    const computed = calculateDebtAllocation(
      activeDebts,
      totalMinimums,
      movePlan
        ? {
            targetAmount: movePlan.targetAmount,
            currentSaved: movePlan.currentSaved,
            targetDate: movePlan.targetDate,
          }
        : undefined,
    );

    const timestamp = now();
    for (const alloc of computed.allocations) {
      const debt = activeDebts.find((d) => d.creditorName === alloc.creditor);
      if (!debt) continue;
      // alloc.payment is "$X,XXX.XX" string — re-derive cents from the breakdown
      // by summing minimum + extra parsed from the breakdown, but it's simpler to
      // just look up the matching minimum + parse the formatted payment string.
      const cents = parsePaymentString(alloc.payment);
      const allocId = newId();
      db.insert(schema.debtAllocations)
        .values({
          id: allocId,
          month: mon,
          debtId: debt.id,
          recommendedAmount: cents,
          actualAmount: null,
          reasoning: alloc.reasoning,
          createdAt: timestamp,
        })
        .run();
    }
    allocations = db
      .select()
      .from(schema.debtAllocations)
      .where(eq(schema.debtAllocations.month, mon))
      .all();
  }

  // Sum payments per debt within the month
  const payments = db
    .select({
      debtId: schema.debtPayments.debtId,
      amount: schema.debtPayments.amount,
    })
    .from(schema.debtPayments)
    .where(and(
      gte(schema.debtPayments.date, start),
      lte(schema.debtPayments.date, end),
    ))
    .all();

  const paidByDebt = new Map<string, { total: number; count: number }>();
  for (const p of payments) {
    const cur = paidByDebt.get(p.debtId) ?? { total: 0, count: 0 };
    cur.total += p.amount;
    cur.count += 1;
    paidByDebt.set(p.debtId, cur);
  }

  // Build per-debt rows (driven by active debts so paid-off-this-month still appears)
  const allDebtsForMonth = db
    .select()
    .from(schema.debts)
    .all();
  const rows: AllocationVsActualRow[] = [];
  for (const debt of allDebtsForMonth) {
    const alloc = allocations.find((a) => a.debtId === debt.id);
    if (!alloc && debt.status !== "active") continue; // skip historic paid-off without alloc
    const recommended = alloc?.recommendedAmount ?? 0;
    const paid = paidByDebt.get(debt.id) ?? { total: 0, count: 0 };
    const actual = paid.total;

    let status: AllocationVsActualRow["status"];
    if (!alloc) {
      status = "no_plan";
    } else if (actual >= recommended) {
      status = "ahead";
    } else if (actual >= recommended * 0.85) {
      status = "on_track";
    } else {
      status = "behind";
    }

    rows.push({
      debtId: debt.id,
      creditorName: debt.creditorName,
      recommended,
      actualPaid: actual,
      paymentCount: paid.count,
      status,
    });
  }

  const totalRecommended = rows.reduce((s, r) => s + r.recommended, 0);
  const totalActual = rows.reduce((s, r) => s + r.actualPaid, 0);

  return { month: mon, totalRecommended, totalActual, rows };
}

/** Parse "$1,234.56" → 123456 (cents). Defensive for weird formatting. */
function parsePaymentString(s: string): number {
  const numeric = parseFloat(s.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100);
}

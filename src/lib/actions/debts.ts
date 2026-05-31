import { cache } from "react";
import { db, schema } from "@/lib/db";
import { eq, and, gte, lte, sql, notInArray } from "drizzle-orm";
import { newId } from "@/lib/utils/ids";
import { now, today, parseDollarsToCents } from "@/lib/utils/format";
import { calculateDebtAllocation, monthsToPayoff, addMonths, simulateDebtPayoff, type SimulatorDebt } from "@/lib/utils/debt-engine";

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
export const getMonthlyAllocationVsActual = cache(_getMonthlyAllocationVsActual);
function _getMonthlyAllocationVsActual(month?: string): AllocationVsActualSummary {
  const mon = month ?? thisMonth();
  const { start, end } = monthBounds(mon);

  const activeDebts = db
    .select()
    .from(schema.debts)
    .where(eq(schema.debts.status, "active"))
    .all();

  // Snap allocations for the current month if none exist yet, OR if the
  // existing snapshot is stale. "Stale" = any allocation's recommended amount
  // is less than the current debt minimum (which means the user updated a
  // minimum after the snapshot was taken — the allocation now under-reports
  // what the user actually owes that creditor).
  let allocations = db
    .select()
    .from(schema.debtAllocations)
    .where(eq(schema.debtAllocations.month, mon))
    .all();

  const isStale =
    allocations.length > 0 &&
    allocations.some((a) => {
      const debt = activeDebts.find((d) => d.id === a.debtId);
      if (!debt) return false;
      // Allocation under-reports the obligation.
      if (a.recommendedAmount < debt.minimumPayment) return true;
      // Reasoning was generated against bad data — e.g. $27k debt showing
      // "Only $0.00 left." Catch those by detecting the marker on a debt
      // whose actual current balance is non-trivial.
      if (debt.currentBalance > 50000 && a.reasoning?.includes("$0.00")) return true;
      return false;
    });
  if (isStale && mon === thisMonth()) {
    db.delete(schema.debtAllocations).where(eq(schema.debtAllocations.month, mon)).run();
    allocations = [];
  }

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

// ============================================================
// PAYOFF PROJECTIONS
// ============================================================

export type DebtPayoffProjection = {
  debtId: string;
  creditorName: string;
  currentBalance: number; // cents
  // Months / payoff date when paying only the minimum.
  monthsAtMinimum: number | null;
  payoffAtMinimum: string | null; // YYYY-MM
  // Same but using the smart allocation's recommended payment for this month.
  monthsAtRecommended: number | null;
  payoffAtRecommended: string | null;
  recommendedPayment: number; // cents (defaults to minimum if no allocation)
};

export type AggregatePayoffProjection = {
  rows: DebtPayoffProjection[];
  // The longest individual payoff among active debts — when "all debt is gone"
  // assuming each debt sticks to its current pace.
  debtFreeMonthsAtMinimum: number | null;
  debtFreeAtMinimum: string | null;
  debtFreeMonthsAtRecommended: number | null;
  debtFreeAtRecommended: string | null;
};

function formatYearMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const getPayoffProjections = cache(_getPayoffProjections);
function _getPayoffProjections(): AggregatePayoffProjection {
  const activeDebts = db
    .select()
    .from(schema.debts)
    .where(eq(schema.debts.status, "active"))
    .all();

  // Pull this-month's allocations to compute recommended-payment payoff dates.
  const d = new Date();
  const month = formatYearMonth(d);
  const allocations = db
    .select()
    .from(schema.debtAllocations)
    .where(eq(schema.debtAllocations.month, month))
    .all();
  const allocByDebt = new Map(allocations.map((a) => [a.debtId, a.recommendedAmount]));

  const rows: DebtPayoffProjection[] = activeDebts
    .filter((debt) => debt.currentBalance > 0)
    .map((debt) => {
      const minMonths = monthsToPayoff(debt.currentBalance, debt.minimumPayment, debt.interestRate);
      const recommendedPayment = allocByDebt.get(debt.id) ?? debt.minimumPayment;
      const recMonths = monthsToPayoff(debt.currentBalance, recommendedPayment, debt.interestRate);

      return {
        debtId: debt.id,
        creditorName: debt.creditorName,
        currentBalance: debt.currentBalance,
        monthsAtMinimum: minMonths,
        payoffAtMinimum: minMonths !== null ? formatYearMonth(addMonths(minMonths)) : null,
        monthsAtRecommended: recMonths,
        payoffAtRecommended: recMonths !== null ? formatYearMonth(addMonths(recMonths)) : null,
        recommendedPayment,
      };
    });

  // Aggregate "debt-free by" = longest individual payoff, in months.
  // If any debt has null months (payment doesn't cover interest), the aggregate is also null.
  const minMonthsList = rows.map((r) => r.monthsAtMinimum);
  const recMonthsList = rows.map((r) => r.monthsAtRecommended);
  const aggregateMin = minMonthsList.includes(null) ? null : Math.max(0, ...(minMonthsList as number[]));
  const aggregateRec = recMonthsList.includes(null) ? null : Math.max(0, ...(recMonthsList as number[]));

  return {
    rows,
    debtFreeMonthsAtMinimum: aggregateMin,
    debtFreeAtMinimum: aggregateMin !== null ? formatYearMonth(addMonths(aggregateMin)) : null,
    debtFreeMonthsAtRecommended: aggregateRec,
    debtFreeAtRecommended: aggregateRec !== null ? formatYearMonth(addMonths(aggregateRec)) : null,
  };
}

/** Parse "$1,234.56" → 123456 (cents). Defensive for weird formatting. */
function parsePaymentString(s: string): number {
  const numeric = parseFloat(s.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100);
}

// ============================================================
// UPDATE / DELETE DEBT
// ============================================================

export type UpdateDebtInput = {
  creditorName?: string;
  type?: "credit_card" | "personal_loan" | "student_loan" | "auto_loan" | "medical" | "tax_debt" | "other";
  originalBalance?: number; // dollars
  currentBalance?: number; // dollars
  interestRate?: number; // percent
  minimumPayment?: number; // dollars
  dueDay?: number | null; // null clears
  creditLimit?: number | null; // null clears
  status?: "active" | "paid_off" | "in_collections" | "deferred";
  notes?: string | null;
  // Next-action deadline lives on the debt row; passing null clears it.
  nextActionDeadline?: string | null; // YYYY-MM-DD
  nextActionAmount?: number | null; // dollars
  nextActionNote?: string | null;
};

export type UpdateDebtResult = { success: true } | { success: false; error: string };

export function updateDebt(debtId: string, input: UpdateDebtInput): UpdateDebtResult {
  if (!debtId) return { success: false, error: "debtId is required" };

  const existing = db.select().from(schema.debts).where(eq(schema.debts.id, debtId)).get();
  if (!existing) return { success: false, error: `Debt ${debtId} not found` };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = { updatedAt: now() };

  if (input.creditorName !== undefined) {
    if (!input.creditorName.trim()) return { success: false, error: "creditorName cannot be blank" };
    updates.creditorName = input.creditorName.trim();
  }
  if (input.type !== undefined) updates.type = input.type;
  if (input.originalBalance !== undefined) {
    if (!Number.isFinite(input.originalBalance) || input.originalBalance <= 0) {
      return { success: false, error: "originalBalance must be positive" };
    }
    updates.originalBalance = parseDollarsToCents(input.originalBalance);
  }
  if (input.currentBalance !== undefined) {
    if (!Number.isFinite(input.currentBalance) || input.currentBalance < 0) {
      return { success: false, error: "currentBalance must be zero or positive" };
    }
    updates.currentBalance = parseDollarsToCents(input.currentBalance);
  }
  if (input.interestRate !== undefined) {
    if (!Number.isFinite(input.interestRate) || input.interestRate < 0) {
      return { success: false, error: "interestRate must be zero or positive" };
    }
    updates.interestRate = input.interestRate / 100;
  }
  if (input.minimumPayment !== undefined) {
    if (!Number.isFinite(input.minimumPayment) || input.minimumPayment < 0) {
      return { success: false, error: "minimumPayment must be zero or positive" };
    }
    updates.minimumPayment = parseDollarsToCents(input.minimumPayment);
  }
  if (input.dueDay !== undefined) {
    if (input.dueDay !== null && (!Number.isFinite(input.dueDay) || input.dueDay < 1 || input.dueDay > 31)) {
      return { success: false, error: "dueDay must be 1-31 or null" };
    }
    updates.dueDay = input.dueDay;
  }
  if (input.creditLimit !== undefined) {
    if (input.creditLimit !== null && (!Number.isFinite(input.creditLimit) || input.creditLimit < 0)) {
      return { success: false, error: "creditLimit must be zero or positive or null" };
    }
    updates.creditLimit = input.creditLimit !== null ? parseDollarsToCents(input.creditLimit) : null;
  }
  if (input.status !== undefined) updates.status = input.status;
  if (input.notes !== undefined) updates.notes = input.notes?.trim() || null;

  if (input.nextActionDeadline !== undefined) updates.nextActionDeadline = input.nextActionDeadline;
  if (input.nextActionAmount !== undefined) {
    updates.nextActionAmount = input.nextActionAmount !== null
      ? parseDollarsToCents(input.nextActionAmount)
      : null;
  }
  if (input.nextActionNote !== undefined) updates.nextActionNote = input.nextActionNote?.trim() || null;

  // If currentBalance crossed to 0 or back, auto-update status unless caller forced it.
  if (input.currentBalance !== undefined && input.status === undefined) {
    const newBalance = updates.currentBalance as number;
    if (newBalance === 0 && existing.status === "active") updates.status = "paid_off";
    else if (newBalance > 0 && existing.status === "paid_off") updates.status = "active";
  }

  db.update(schema.debts).set(updates).where(eq(schema.debts.id, debtId)).run();
  return { success: true };
}

export type DeleteDebtResult = { success: true } | { success: false; error: string };

export function deleteDebt(debtId: string): DeleteDebtResult {
  if (!debtId) return { success: false, error: "debtId is required" };
  const existing = db.select().from(schema.debts).where(eq(schema.debts.id, debtId)).get();
  if (!existing) return { success: false, error: `Debt ${debtId} not found` };

  // Clean up dependent rows (debt payments + allocations) so we don't leave
  // orphans. The schema doesn't cascade.
  db.delete(schema.debtPayments).where(eq(schema.debtPayments.debtId, debtId)).run();
  db.delete(schema.debtAllocations).where(eq(schema.debtAllocations.debtId, debtId)).run();
  db.delete(schema.debts).where(eq(schema.debts.id, debtId)).run();

  return { success: true };
}

// ============================================================
// CREDIT UTILIZATION LEVERS
// ============================================================

export type UtilizationLever = {
  debtId: string;
  creditorName: string;
  balance: number; // cents
  creditLimit: number; // cents
  currentUtilizationPct: number; // 0-200+ (can exceed 100 if over-limit)
  toReachThirty: number; // cents needed to drop to 29% (one shy of threshold)
  toReachTen: number; // cents needed to drop to 9%
  isOverLimit: boolean;
};

export type CreditScoreLevers = {
  cards: UtilizationLever[]; // sorted by current utilization desc
  totalToReachThirty: number; // cents — sum across all cards still above 30%
  totalToReachTen: number; // cents — sum across all cards still above 10%
  overLimitCount: number;
};

/**
 * For each active credit card with a known limit, compute the dollars
 * required to drop utilization below the 30% and 10% thresholds — the two
 * inflection points scoring models care about most. Cards already below
 * 30% / 10% report $0 for the respective target.
 */
export const getCreditUtilizationLevers = cache(_getCreditUtilizationLevers);
function _getCreditUtilizationLevers(): CreditScoreLevers {
  const cards = db
    .select()
    .from(schema.debts)
    .where(and(eq(schema.debts.status, "active"), eq(schema.debts.type, "credit_card")))
    .all()
    .filter((d) => d.creditLimit !== null && d.creditLimit > 0);

  const levers: UtilizationLever[] = cards.map((d) => {
    const limit = d.creditLimit!;
    const balance = d.currentBalance;
    const utilPct = (balance / limit) * 100;
    const isOverLimit = balance > limit;
    // Aim one point under the threshold so rounding doesn't trip on the line.
    const target30 = Math.floor(limit * 0.29);
    const target10 = Math.floor(limit * 0.09);
    const toReachThirty = Math.max(0, balance - target30);
    const toReachTen = Math.max(0, balance - target10);
    return {
      debtId: d.id,
      creditorName: d.creditorName,
      balance,
      creditLimit: limit,
      currentUtilizationPct: utilPct,
      toReachThirty,
      toReachTen,
      isOverLimit,
    };
  });

  levers.sort((a, b) => b.currentUtilizationPct - a.currentUtilizationPct);

  const totalToReachThirty = levers.reduce((s, l) => s + l.toReachThirty, 0);
  const totalToReachTen = levers.reduce((s, l) => s + l.toReachTen, 0);
  const overLimitCount = levers.filter((l) => l.isOverLimit).length;

  return { cards: levers, totalToReachThirty, totalToReachTen, overLimitCount };
}

// ============================================================
// CREATE DEBT
// ============================================================

export type CreateDebtInput = {
  creditorName: string;
  type: "credit_card" | "personal_loan" | "student_loan" | "auto_loan" | "medical" | "tax_debt" | "other";
  originalBalance: number; // dollars
  currentBalance?: number; // dollars; defaults to originalBalance
  interestRate: number; // percent (e.g. 21.99 for 21.99%)
  minimumPayment: number; // dollars
  dueDay?: number; // 1-31
  creditLimit?: number; // dollars; only meaningful for credit cards
  notes?: string;
};

export type CreateDebtResult =
  | { success: true; debtId: string }
  | { success: false; error: string };

export function createDebt(input: CreateDebtInput): CreateDebtResult {
  if (!input.creditorName?.trim()) return { success: false, error: "creditorName is required" };
  if (!Number.isFinite(input.originalBalance) || input.originalBalance <= 0) {
    return { success: false, error: "originalBalance must be positive" };
  }
  if (!Number.isFinite(input.interestRate) || input.interestRate < 0) {
    return { success: false, error: "interestRate must be zero or positive" };
  }
  if (!Number.isFinite(input.minimumPayment) || input.minimumPayment < 0) {
    return { success: false, error: "minimumPayment must be zero or positive" };
  }

  const original = parseDollarsToCents(input.originalBalance);
  const current = input.currentBalance != null
    ? parseDollarsToCents(input.currentBalance)
    : original;
  if (current > original) {
    return { success: false, error: "currentBalance cannot exceed originalBalance" };
  }

  const id = newId();
  const timestamp = now();

  db.insert(schema.debts).values({
    id,
    creditorName: input.creditorName.trim(),
    type: input.type,
    originalBalance: original,
    currentBalance: current,
    interestRate: input.interestRate / 100,
    minimumPayment: parseDollarsToCents(input.minimumPayment),
    dueDay: input.dueDay ?? null,
    creditLimit: input.creditLimit != null ? parseDollarsToCents(input.creditLimit) : null,
    status: current === 0 ? "paid_off" : "active",
    notes: input.notes?.trim() || null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();

  return { success: true, debtId: id };
}

// ============================================================
// DEBT DEADLINES (next-action callouts)
// ============================================================

export type DebtDeadline = {
  debtId: string;
  creditorName: string;
  deadline: string; // YYYY-MM-DD
  amount: number; // cents
  note: string | null;
  daysAway: number; // negative if past
};

/**
 * Active debts with a next_action_deadline within `withinDays` days from
 * today (default 14). Past-due deadlines are also included so the user
 * can't ignore them. Sorted by deadline ascending.
 */
export const getUpcomingDebtDeadlines = cache(_getUpcomingDebtDeadlines);
function _getUpcomingDebtDeadlines(withinDays: number = 14): DebtDeadline[] {
  const debts = db
    .select({
      id: schema.debts.id,
      creditorName: schema.debts.creditorName,
      deadline: schema.debts.nextActionDeadline,
      amount: schema.debts.nextActionAmount,
      note: schema.debts.nextActionNote,
      status: schema.debts.status,
    })
    .from(schema.debts)
    .all();

  const now = Date.now();
  const horizonMs = now + withinDays * 86400000;
  const out: DebtDeadline[] = [];
  for (const d of debts) {
    if (d.status !== "active") continue;
    if (!d.deadline || d.amount === null || d.amount === undefined) continue;
    const t = new Date(d.deadline + "T00:00:00").getTime();
    if (t > horizonMs) continue;
    const daysAway = Math.ceil((t - now) / 86400000);
    out.push({
      debtId: d.id,
      creditorName: d.creditorName,
      deadline: d.deadline,
      amount: d.amount,
      note: d.note,
      daysAway,
    });
  }
  out.sort((a, b) => a.deadline.localeCompare(b.deadline));
  return out;
}

// ============================================================
// DEBT STRATEGY (payoff scenarios for /reports)
// ============================================================

export type DebtStrategyScenario = {
  label: string; // "Minimums only" | "Current pace" | "+$100/mo" | …
  extraMonthly: number; // cents
  monthsToDebtFree: number | null;
  payoffDate: string | null; // YYYY-MM
  totalInterestPaid: number; // cents
  totalPaid: number; // cents
  interestSavedVsMin: number; // cents (0 for the minimum scenario)
  monthsSavedVsMin: number | null;
};

export type AvalancheStep = {
  debtId: string;
  creditorName: string;
  balance: number; // cents
  apr: number; // decimal
  minimumPayment: number;
  monthlyInterest: number; // cents — what's accruing right now if untouched
  payoffMonth: number; // month index in the avalanche scenario
  payoffDate: string; // YYYY-MM
};

export type DebtStrategy = {
  totalBalance: number;
  totalMinimums: number;
  currentRecommendedTotal: number; // sum of this month's smart-allocation rows
  scenarios: DebtStrategyScenario[]; // ordered: min, current, +50, +100, +200, +500
  avalanche: AvalancheStep[];
  snowballMonths: number | null; // months at min using snowball, for comparison
  avalancheMonths: number | null; // months at min using avalanche
  // The cheapest single-debt acceleration: which debt gives the best $/month
  // marginal payoff impact at +$50/mo? Used for an "attack here first" callout.
  highestImpactTarget: { debtId: string; creditorName: string; reason: string } | null;
};

function formatYM(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const getDebtStrategy = cache(_getDebtStrategy);
function _getDebtStrategy(): DebtStrategy {
  const activeDebts = db
    .select()
    .from(schema.debts)
    .where(eq(schema.debts.status, "active"))
    .all();

  const totalBalance = activeDebts.reduce((s, d) => s + d.currentBalance, 0);
  const totalMinimums = activeDebts.reduce((s, d) => s + d.minimumPayment, 0);

  // This month's smart-allocation rows define "current pace" extra.
  const monthKey = formatYM(new Date());
  const allocs = db
    .select()
    .from(schema.debtAllocations)
    .where(eq(schema.debtAllocations.month, monthKey))
    .all();
  const currentRecommendedTotal = allocs.reduce((s, a) => s + a.recommendedAmount, 0);
  const currentExtra = Math.max(0, currentRecommendedTotal - totalMinimums);

  const simInputs: SimulatorDebt[] = activeDebts.map((d) => ({
    id: d.id,
    creditorName: d.creditorName,
    currentBalance: d.currentBalance,
    interestRate: d.interestRate,
    minimumPayment: d.minimumPayment,
  }));

  const minSim = simulateDebtPayoff(simInputs, 0, "avalanche");
  const minMonths = minSim.monthsToDebtFree;
  const minInterest = minSim.totalInterestPaid;

  const buildScenario = (label: string, extra: number): DebtStrategyScenario => {
    const sim = simulateDebtPayoff(simInputs, extra, "avalanche");
    return {
      label,
      extraMonthly: extra,
      monthsToDebtFree: sim.monthsToDebtFree,
      payoffDate: sim.monthsToDebtFree !== null ? formatYM(addMonths(sim.monthsToDebtFree)) : null,
      totalInterestPaid: sim.totalInterestPaid,
      totalPaid: sim.totalPaid,
      interestSavedVsMin: minInterest - sim.totalInterestPaid,
      monthsSavedVsMin:
        minMonths !== null && sim.monthsToDebtFree !== null ? minMonths - sim.monthsToDebtFree : null,
    };
  };

  // Run the current-pace simulation once — used both for the "Current pace"
  // scenario card and the avalanche order below.
  const currentSim = simulateDebtPayoff(simInputs, currentExtra, "avalanche");
  const currentPaceScenario: DebtStrategyScenario = {
    label: "Current pace",
    extraMonthly: currentExtra,
    monthsToDebtFree: currentSim.monthsToDebtFree,
    payoffDate: currentSim.monthsToDebtFree !== null ? formatYM(addMonths(currentSim.monthsToDebtFree)) : null,
    totalInterestPaid: currentSim.totalInterestPaid,
    totalPaid: currentSim.totalPaid,
    interestSavedVsMin: minInterest - currentSim.totalInterestPaid,
    monthsSavedVsMin:
      minMonths !== null && currentSim.monthsToDebtFree !== null ? minMonths - currentSim.monthsToDebtFree : null,
  };

  const scenarios: DebtStrategyScenario[] = [
    { ...buildScenario("Minimums only", 0), interestSavedVsMin: 0, monthsSavedVsMin: 0 },
    currentPaceScenario,
    buildScenario("+$100/mo", currentExtra + 10000),
    buildScenario("+$300/mo", currentExtra + 30000),
    buildScenario("+$500/mo", currentExtra + 50000),
  ];

  // Avalanche order reuses currentSim from above — same parameters, no point
  // running the simulator a second time.
  const avalanche: AvalancheStep[] = activeDebts
    .map((d) => {
      const order = currentSim.payoffOrder.find((p) => p.debtId === d.id);
      const monthlyInterest = Math.round(d.currentBalance * (d.interestRate / 12));
      const payoffMonth = order?.payoffMonth ?? 0;
      return {
        debtId: d.id,
        creditorName: d.creditorName,
        balance: d.currentBalance,
        apr: d.interestRate,
        minimumPayment: d.minimumPayment,
        monthlyInterest,
        payoffMonth,
        payoffDate: payoffMonth > 0 ? formatYM(addMonths(payoffMonth)) : "—",
      };
    })
    .sort((a, b) => a.payoffMonth - b.payoffMonth);

  // Compare avalanche vs snowball at minimums-only — which strategy wins
  // for this user's debt mix?
  const snowballSim = simulateDebtPayoff(simInputs, 0, "snowball");
  const avalancheSim = simulateDebtPayoff(simInputs, 0, "avalanche");

  // Highest-impact target: the debt where +$50/mo extra produces the biggest
  // monthly-interest reduction relative to its minimum. Proxy: highest APR
  // with non-trivial balance.
  const apexCandidate = [...activeDebts]
    .filter((d) => d.currentBalance > 5000) // skip near-paid-off
    .sort((a, b) => b.interestRate - a.interestRate)[0];
  const highestImpactTarget = apexCandidate
    ? {
        debtId: apexCandidate.id,
        creditorName: apexCandidate.creditorName,
        reason: `${(apexCandidate.interestRate * 100).toFixed(2)}% APR — every $1 here saves the most interest`,
      }
    : null;

  return {
    totalBalance,
    totalMinimums,
    currentRecommendedTotal,
    scenarios,
    avalanche,
    snowballMonths: snowballSim.monthsToDebtFree,
    avalancheMonths: avalancheSim.monthsToDebtFree,
    highestImpactTarget,
  };
}

// ============================================================
// AUTO-PAY TRACKING
// Settings-backed map of which debts have auto-pay configured. Pure local
// state — we have no way to verify with the creditor, so this is a memory
// aid for the user to commit + check off.
// ============================================================
export type AutopayStatus = {
  debtId: string;
  enabled: boolean;
  setAt: string | null;     // ISO when user marked it
  note: string | null;       // optional — e.g. "via Capital One mobile app"
};

const AUTOPAY_SETTINGS_KEY = "debt_autopay_status";

function readAutopayMap(): Record<string, { enabled: boolean; setAt: string | null; note: string | null }> {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, AUTOPAY_SETTINGS_KEY)).get();
  if (!row) return {};
  try {
    const parsed = JSON.parse(row.value);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeAutopayMap(map: Record<string, { enabled: boolean; setAt: string | null; note: string | null }>) {
  const value = JSON.stringify(map);
  const existing = db.select().from(schema.settings).where(eq(schema.settings.key, AUTOPAY_SETTINGS_KEY)).get();
  if (existing) {
    db.update(schema.settings).set({ value, updatedAt: now() }).where(eq(schema.settings.key, AUTOPAY_SETTINGS_KEY)).run();
  } else {
    db.insert(schema.settings).values({ key: AUTOPAY_SETTINGS_KEY, value, updatedAt: now() }).run();
  }
}

/**
 * Trailing-30 spend in the "Late Fees & Interest" category. Used by the
 * autopay checklist banner to quantify the cost of NOT setting up autopay.
 * Filters out internal transfers and excluded accounts the same way every
 * other actual-spend query does.
 */
export const getRecentLateFees = cache((): number => {
  // Inline category-id lookups to avoid a circular import with dashboard.ts.
  // dashboard.ts already imports debts.ts (for getPayoffProjections), so we
  // can't import its helpers here.
  const internalGroup = db
    .select({ id: schema.categoryGroups.id })
    .from(schema.categoryGroups)
    .where(eq(schema.categoryGroups.name, "Internal"))
    .get();
  const internalCats = internalGroup
    ? db
        .select({ id: schema.categories.id })
        .from(schema.categories)
        .where(eq(schema.categories.groupId, internalGroup.id))
        .all()
        .map((c) => c.id)
    : [];
  const excludedAccounts = db
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(eq(schema.accounts.excludeFromReports, true))
    .all()
    .map((a) => a.id);

  const t30 = new Date();
  t30.setDate(t30.getDate() - 30);
  const t30Str = t30.toISOString().split("T")[0];
  const todayStr = new Date().toISOString().split("T")[0];

  const row = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)` })
    .from(schema.transactions)
    .leftJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
    .where(and(
      eq(schema.transactions.type, "expense"),
      eq(schema.categories.name, "Late Fees & Interest"),
      gte(schema.transactions.date, t30Str),
      lte(schema.transactions.date, todayStr),
      internalCats.length > 0 ? notInArray(schema.transactions.categoryId, internalCats) : undefined,
      excludedAccounts.length > 0 ? notInArray(schema.transactions.accountId, excludedAccounts) : undefined,
    ))
    .get();
  return row?.total ?? 0;
});

export const getAutopayStatuses = cache(_getAutopayStatuses);
function _getAutopayStatuses(): AutopayStatus[] {
  const map = readAutopayMap();
  const activeDebts = db.select().from(schema.debts).where(eq(schema.debts.status, "active")).all();
  return activeDebts.map((d) => {
    const entry = map[d.id];
    return {
      debtId: d.id,
      enabled: entry?.enabled ?? false,
      setAt: entry?.setAt ?? null,
      note: entry?.note ?? null,
    };
  });
}

export function setAutopayStatus(debtId: string, enabled: boolean, note?: string) {
  const map = readAutopayMap();
  map[debtId] = {
    enabled,
    setAt: enabled ? now() : null,
    note: note ?? map[debtId]?.note ?? null,
  };
  writeAutopayMap(map);
}

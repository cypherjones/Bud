import { db, schema } from "@/lib/db";
import { eq, and, gte, lte, desc, sql, notInArray } from "drizzle-orm";

/** Category IDs that represent internal moves (transfers, round-ups), not real spending */
function getInternalCategoryIds(): string[] {
  const internalGroup = db
    .select({ id: schema.categoryGroups.id })
    .from(schema.categoryGroups)
    .where(eq(schema.categoryGroups.name, "Internal"))
    .get();
  if (!internalGroup) return [];
  return db
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(eq(schema.categories.groupId, internalGroup.id))
    .all()
    .map((c) => c.id);
}

/** Account IDs flagged as excluded — their rows do not appear in dashboard or reports */
function getExcludedAccountIds(): string[] {
  return db
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(eq(schema.accounts.excludeFromReports, true))
    .all()
    .map((a) => a.id);
}

export { getInternalCategoryIds, getExcludedAccountIds };

function getMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

export function getMetrics() {
  const monthStart = getMonthStart();
  const internalCats = getInternalCategoryIds();
  const excludedAccounts = getExcludedAccountIds();

  const baseFilters = (start: string, end?: string, type?: "income" | "expense") => and(
    type ? eq(schema.transactions.type, type) : undefined,
    gte(schema.transactions.date, start),
    end ? lte(schema.transactions.date, end) : undefined,
    internalCats.length > 0 ? notInArray(schema.transactions.categoryId, internalCats) : undefined,
    excludedAccounts.length > 0 ? notInArray(schema.transactions.accountId, excludedAccounts) : undefined,
  );

  const spending = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)` })
    .from(schema.transactions)
    .where(baseFilters(monthStart, undefined, "expense"))
    .get();

  const income = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)` })
    .from(schema.transactions)
    .where(baseFilters(monthStart, undefined, "income"))
    .get();

  // Previous month for comparison
  const d = new Date();
  const prevMonthStart = new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().split("T")[0];
  const prevMonthEnd = new Date(d.getFullYear(), d.getMonth(), 0).toISOString().split("T")[0];

  const prevSpending = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)` })
    .from(schema.transactions)
    .where(baseFilters(prevMonthStart, prevMonthEnd, "expense"))
    .get();

  const prevIncome = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)` })
    .from(schema.transactions)
    .where(baseFilters(prevMonthStart, prevMonthEnd, "income"))
    .get();

  return {
    spending: spending?.total ?? 0,
    income: income?.total ?? 0,
    prevSpending: prevSpending?.total ?? 0,
    prevIncome: prevIncome?.total ?? 0,
  };
}

export function getSpendingByCategory() {
  const monthStart = getMonthStart();
  const internalCats = getInternalCategoryIds();
  const excludedAccounts = getExcludedAccountIds();

  const results = db
    .select({
      categoryId: schema.transactions.categoryId,
      total: sql<number>`SUM(${schema.transactions.amount})`,
    })
    .from(schema.transactions)
    .where(and(
      eq(schema.transactions.type, "expense"),
      gte(schema.transactions.date, monthStart),
      internalCats.length > 0 ? notInArray(schema.transactions.categoryId, internalCats) : undefined,
      excludedAccounts.length > 0 ? notInArray(schema.transactions.accountId, excludedAccounts) : undefined,
    ))
    .groupBy(schema.transactions.categoryId)
    .all();

  const categories = db.select().from(schema.categories).all();
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));

  return results
    .map((r) => {
      const cat = catMap[r.categoryId ?? ""];
      return {
        name: cat?.name ?? "Other",
        value: r.total,
        color: cat?.color ?? "#6B7280",
      };
    })
    .sort((a, b) => b.value - a.value);
}

export function getDebtSummary() {
  const debts = db.select().from(schema.debts).where(eq(schema.debts.status, "active")).all();
  const paidOff = db.select().from(schema.debts).where(eq(schema.debts.status, "paid_off")).all();

  const totalActive = debts.reduce((s, d) => s + d.currentBalance, 0);
  const totalOriginal = [...debts, ...paidOff].reduce((s, d) => s + d.originalBalance, 0);
  const totalPaidOff = totalOriginal - totalActive;
  const progress = totalOriginal > 0 ? Math.round((totalPaidOff / totalOriginal) * 100) : 0;

  // This-month aggregate: recommended (sum of debtAllocations.recommendedAmount)
  // vs actual (sum of debtPayments.amount within the current month).
  const d = new Date();
  const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const monthStart = `${month}-01`;
  const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0];

  const recommendedRow = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.debtAllocations.recommendedAmount}), 0)` })
    .from(schema.debtAllocations)
    .where(eq(schema.debtAllocations.month, month))
    .get();

  const actualRow = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.debtPayments.amount}), 0)` })
    .from(schema.debtPayments)
    .where(and(
      gte(schema.debtPayments.date, monthStart),
      lte(schema.debtPayments.date, monthEnd),
    ))
    .get();

  const monthRecommended = recommendedRow?.total ?? 0;
  const monthActual = actualRow?.total ?? 0;

  return {
    debts,
    totalActive,
    totalOriginal,
    totalPaidOff,
    progress,
    monthRecommended,
    monthActual,
    month,
  };
}

export function getMovePlan() {
  const plan = db
    .select()
    .from(schema.financialPlans)
    .where(eq(schema.financialPlans.type, "move"))
    .limit(1)
    .get();

  if (!plan) return null;

  const items = db
    .select()
    .from(schema.planLineItems)
    .where(eq(schema.planLineItems.planId, plan.id))
    .orderBy(schema.planLineItems.sortOrder)
    .all();

  const totalEstimated = items.reduce((s, i) => s + (i.estimatedAmount ?? 0), 0);
  const paidCount = items.filter((i) => i.isPaid).length;
  const target = plan.targetAmount ?? totalEstimated;
  const progress = target > 0 ? Math.round((plan.currentSaved / target) * 100) : 0;

  const daysUntil = plan.targetDate
    ? Math.ceil((new Date(plan.targetDate).getTime() - Date.now()) / 86400000)
    : null;

  return { plan, items, totalEstimated, paidCount, target, progress, daysUntil };
}

export function getCreditSummary() {
  const scores = db
    .select()
    .from(schema.creditScores)
    .orderBy(desc(schema.creditScores.date))
    .limit(12)
    .all();

  if (scores.length === 0) return null;

  const latest = scores[0];
  const previous = scores.length > 1 ? scores[1] : null;
  const change = previous ? latest.score - previous.score : 0;

  const tier =
    latest.score >= 800 ? "Excellent" :
    latest.score >= 740 ? "Very Good" :
    latest.score >= 670 ? "Good" :
    latest.score >= 580 ? "Fair" : "Poor";

  // Get latest factors
  const factors = db
    .select()
    .from(schema.creditFactors)
    .where(eq(schema.creditFactors.scoreId, latest.id))
    .get();

  return { latest, previous, change, tier, factors, history: scores.reverse() };
}

export function getTaxSummary() {
  const obligations = db
    .select()
    .from(schema.taxObligations)
    .where(eq(schema.taxObligations.status, "active"))
    .all();

  const totalOwed = obligations.reduce((s, t) => s + t.remainingBalance, 0);

  // Find next due
  const today = getToday();
  const upcoming = obligations
    .filter((t) => t.dueDate && t.dueDate >= today)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

  return { obligations, totalOwed, nextDue: upcoming[0] ?? null };
}

export function getUpcomingBills() {
  return db
    .select()
    .from(schema.recurringTransactions)
    .where(eq(schema.recurringTransactions.isActive, true))
    .all();
}

// ============================================================
// SINCE-LAST-VISIT (delta strip on the home dashboard)
// ============================================================

const LAST_VISIT_KEY = "last_visit_at";
const LAST_SYNC_ERRORS_KEY = "last_sync_errors"; // optional companion key

export type SinceLastVisit = {
  lastVisitAt: string | null;
  newTransactionCount: number;
  newDebtPaymentCount: number;
  netDelta: number; // cents — income minus expenses on rows added since last visit
  syncErrors: string[];
  /** True if the strip should be rendered (last visit is null or > 6h ago). */
  staleEnoughToShow: boolean;
};

export function getSinceLastVisit(): SinceLastVisit {
  const visitRow = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, LAST_VISIT_KEY))
    .get();

  // settings.value is a JSON string per schema convention
  let lastVisitAt: string | null = null;
  if (visitRow) {
    try {
      const parsed = JSON.parse(visitRow.value);
      lastVisitAt = typeof parsed === "string" ? parsed : null;
    } catch {
      lastVisitAt = null;
    }
  }

  const since = lastVisitAt ?? new Date(0).toISOString();

  const newTxns = db
    .select({
      type: schema.transactions.type,
      amount: schema.transactions.amount,
    })
    .from(schema.transactions)
    .where(gte(schema.transactions.createdAt, since))
    .all();

  const newPayments = db
    .select({ id: schema.debtPayments.id })
    .from(schema.debtPayments)
    .where(gte(schema.debtPayments.createdAt, since))
    .all();

  let income = 0;
  let expense = 0;
  for (const t of newTxns) {
    if (t.type === "income") income += t.amount;
    else if (t.type === "expense") expense += t.amount;
  }

  // Optional sync error log (an array of strings, JSON-encoded in settings)
  const errorsRow = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, LAST_SYNC_ERRORS_KEY))
    .get();
  let syncErrors: string[] = [];
  if (errorsRow) {
    try {
      const parsed = JSON.parse(errorsRow.value);
      if (Array.isArray(parsed)) syncErrors = parsed.filter((s) => typeof s === "string");
    } catch {
      syncErrors = [];
    }
  }

  const sixHoursMs = 6 * 60 * 60 * 1000;
  const staleEnoughToShow =
    lastVisitAt === null || Date.now() - new Date(lastVisitAt).getTime() > sixHoursMs;

  return {
    lastVisitAt,
    newTransactionCount: newTxns.length,
    newDebtPaymentCount: newPayments.length,
    netDelta: income - expense,
    syncErrors,
    staleEnoughToShow,
  };
}

export function markVisitNow(): void {
  const stamp = JSON.stringify(new Date().toISOString());
  const updatedAt = new Date().toISOString();
  const existing = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, LAST_VISIT_KEY))
    .get();
  if (existing) {
    db.update(schema.settings)
      .set({ value: stamp, updatedAt })
      .where(eq(schema.settings.key, LAST_VISIT_KEY))
      .run();
  } else {
    db.insert(schema.settings).values({ key: LAST_VISIT_KEY, value: stamp, updatedAt }).run();
  }
}

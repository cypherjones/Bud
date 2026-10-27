import { cache } from "react";
import { db, schema } from "@/lib/db";
import { eq, and, gte, lte, sql, inArray, notInArray } from "drizzle-orm";
import { newId } from "@/lib/utils/ids";
import { now, formatCurrencyCompact } from "@/lib/utils/format";
import { getInternalCategoryIds, getExcludedAccountIds, getMovableSavingsSplit } from "./dashboard";
import { getSubscriptionAudit, getCashFlowForecast } from "./reports";
import { getAutopayStatuses } from "./debts";

import { BUFFER_TARGET_CENTS } from "@/lib/financial-constants";

// ============================================================
// CATEGORY BUCKET CLASSIFICATION
// Drives both the strategic allocation breakdown AND the suggestion engine.
// Categories not in the map (e.g. Income, Transfers, Round-Ups) are excluded
// from the breakdown entirely — they're internal/income, not "spend."
//
// The client-safe versions of these (no DB imports) live in
// `src/lib/types/buckets.ts` so client components can import them.
// ============================================================
export type { AllocationBucketKey } from "@/lib/types/buckets";
type AllocationBucketKey = "committed" | "essential" | "operational" | "discretionary";

const CATEGORY_BUCKETS: Record<string, AllocationBucketKey> = {
  // Committed — contractually required or hard to cut quickly. Don't suggest cuts here.
  "Housing": "committed",
  "Auto Insurance": "committed",
  "Insurance": "committed",
  "Renters Insurance": "committed",
  "Bills & Utilities": "committed",
  "Utilities": "committed",
  "Internet": "committed",
  "Phone": "committed",
  // "Phone & Internet" deprecated 2026-05; kept out of CATEGORY_BUCKETS so a
  // resync that ever recreates it would land it in unclassified, surfacing as
  // a noticeable orphan rather than silently joining a bucket. Use Phone or
  // Internet directly.
  "Home & Garden": "committed",
  "Debt Payment": "committed",
  "Loan Payment": "committed",
  "Car Payment": "committed",
  "Late Fees & Interest": "committed",
  "Taxes": "committed",
  "Savings": "committed", // outflow into savings — committed by user choice
  "Investing": "committed",
  "Crypto": "committed",
  "Legal Services": "committed",

  // Essential — need to live; small trim possible but not the lever.
  "Groceries": "essential",
  "Health": "essential",
  "Pharmacy": "essential",
  "Personal Care": "essential",
  "Gas & Fuel": "essential",
  "Transport": "essential",
  "Car Care": "essential",

  // Operational — services & subscriptions. Reviewable; kill list applies here.
  "Subscriptions": "operational",
  "Streaming": "operational",
  "AI Tools": "operational",
  "Cloud Storage": "operational",
  "SaaS & Dev Tools": "operational",
  "News & Media": "operational",
  "Web Hosting": "operational",
  "Gaming": "operational",

  // Discretionary — the actual cuttable lever.
  // Note: Dining + Fast Food were merged into Restaurants — those category
  // names are dead in the data layer but kept here as no-ops to avoid surprise
  // if a Teller sync ever creates a transaction in them. Remove later if the
  // categories themselves are deleted.
  "Restaurants": "discretionary",
  "Dining": "discretionary",
  "Fast Food": "discretionary",
  "Coffee & Cafes": "discretionary",
  "Entertainment": "discretionary",
  "Shopping": "discretionary",
  "Clothing & Fashion": "discretionary",
  "Books & Education": "discretionary",
  "Stationery & Gifts": "discretionary",
  "Vape & Tobacco": "discretionary",
  "Adult Content": "discretionary",
  "Peer-to-Peer": "discretionary",
  "Other": "discretionary",
};

function getMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** User-managed list of category NAMES that should not appear in any
 *  actionable surface (action queue, suggestions, unbudgeted-with-spending
 *  rows). Dollars still aggregate into the bucket totals — the math stays
 *  honest — but the user isn't pestered to budget/cut these. Stored as a
 *  JSON array under settings.hidden_categories. */
function getHiddenCategoryNames(): Set<string> {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, "hidden_categories")).get();
  if (!row) return new Set();
  try {
    const parsed = JSON.parse(row.value);
    if (Array.isArray(parsed)) return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch { /* malformed — treat as empty */ }
  return new Set();
}

export function setHiddenCategories(names: string[]) {
  const value = JSON.stringify(names);
  const existing = db.select().from(schema.settings).where(eq(schema.settings.key, "hidden_categories")).get();
  if (existing) {
    db.update(schema.settings).set({ value, updatedAt: now() }).where(eq(schema.settings.key, "hidden_categories")).run();
  } else {
    db.insert(schema.settings).values({ key: "hidden_categories", value, updatedAt: now() }).run();
  }
}

export function getHiddenCategories(): string[] {
  return [...getHiddenCategoryNames()];
}

/** Last day of the month containing `monthStart` (a "YYYY-MM-01" string). */
function getMonthEnd(monthStart: string): string {
  const [y, m] = monthStart.split("-").map(Number);
  const last = new Date(y, m, 0);
  return last.toISOString().split("T")[0];
}

export type BudgetRow = {
  budgetId: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  groupName: string | null;
  groupColor: string | null;
  groupSort: number | null;
  budgeted: number;
  spent: number;
  remaining: number;
  percentUsed: number;
  // Previous-calendar-month total for this category (cents). Drives the MoM
  // delta the user sees inline — "$X spent · vs $Y last month (−$Z)" — which
  // is the awareness layer standard apps lead with.
  prevMonthSpent: number;
};

export const getBudgetOverview = cache(_getBudgetOverview);
function _getBudgetOverview(monthStartOverride?: string): BudgetRow[] {
  const monthStart = monthStartOverride ?? getMonthStart();

  const budgets = db
    .select({
      budgetId: schema.budgets.id,
      categoryId: schema.budgets.categoryId,
      budgeted: schema.budgets.amount,
      categoryName: schema.categories.name,
      categoryColor: schema.categories.color,
      groupName: schema.categoryGroups.name,
      groupColor: schema.categoryGroups.color,
      groupSort: schema.categoryGroups.sortOrder,
    })
    .from(schema.budgets)
    .innerJoin(schema.categories, eq(schema.budgets.categoryId, schema.categories.id))
    .leftJoin(schema.categoryGroups, eq(schema.categories.groupId, schema.categoryGroups.id))
    .all();

  // Get spending per category for the requested month. We pin to month-end so
  // that viewing a prior month doesn't leak in current/future spending, and we
  // strip excluded accounts (Business Basic Checking) + Internal categories
  // (transfers, round-ups) the same way the dashboard does.
  const monthEnd = getMonthEnd(monthStart);
  const internalCats = getInternalCategoryIds();
  const excludedAccounts = getExcludedAccountIds();

  const spending = db
    .select({
      categoryId: schema.transactions.categoryId,
      total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)`,
    })
    .from(schema.transactions)
    .where(and(
      eq(schema.transactions.type, "expense"),
      gte(schema.transactions.date, monthStart),
      lte(schema.transactions.date, monthEnd),
      internalCats.length > 0 ? notInArray(schema.transactions.categoryId, internalCats) : undefined,
      excludedAccounts.length > 0 ? notInArray(schema.transactions.accountId, excludedAccounts) : undefined,
    ))
    .groupBy(schema.transactions.categoryId)
    .all();

  const spentMap = Object.fromEntries(spending.map((s) => [s.categoryId, s.total]));

  // === Previous calendar month — for MoM delta ===
  // The "is this month worse / better than last?" anchor. Use the FULL prior
  // month (1st through last day) so the comparison is calendar-to-calendar.
  // When viewing a current month MTD, this slightly disadvantages "this month"
  // (partial vs full), but the prevMonthSpent number is also surfaced raw so
  // the user can mentally adjust.
  const prevMonthDate = new Date(monthStart + "T00:00:00");
  prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
  const prevMonthStart = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}-01`;
  const prevMonthEnd = getMonthEnd(prevMonthStart);
  const prevSpending = db
    .select({
      categoryId: schema.transactions.categoryId,
      total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)`,
    })
    .from(schema.transactions)
    .where(and(
      eq(schema.transactions.type, "expense"),
      gte(schema.transactions.date, prevMonthStart),
      lte(schema.transactions.date, prevMonthEnd),
      internalCats.length > 0 ? notInArray(schema.transactions.categoryId, internalCats) : undefined,
      excludedAccounts.length > 0 ? notInArray(schema.transactions.accountId, excludedAccounts) : undefined,
    ))
    .groupBy(schema.transactions.categoryId)
    .all();
  const prevSpentMap = Object.fromEntries(prevSpending.map((s) => [s.categoryId, s.total]));

  return budgets.map((b) => {
    const spent = spentMap[b.categoryId ?? ""] ?? 0;
    const prevMonthSpent = prevSpentMap[b.categoryId ?? ""] ?? 0;
    const remaining = b.budgeted - spent;
    const percentUsed = b.budgeted > 0 ? Math.round((spent / b.budgeted) * 100) : 0;

    return {
      budgetId: b.budgetId,
      categoryId: b.categoryId ?? "",
      categoryName: b.categoryName ?? "Unknown",
      categoryColor: b.categoryColor ?? "#6b7280",
      groupName: b.groupName,
      groupColor: b.groupColor,
      groupSort: b.groupSort,
      budgeted: b.budgeted,
      spent,
      remaining,
      percentUsed,
      prevMonthSpent,
    };
  }).sort((a, b) => (a.groupSort ?? 99) - (b.groupSort ?? 99));
}

export function getBudgetSummary(monthStartOverride?: string) {
  const rows = getBudgetOverview(monthStartOverride);
  const totalBudgeted = rows.reduce((s, r) => s + r.budgeted, 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  const totalRemaining = totalBudgeted - totalSpent;
  const percentUsed = totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 100) : 0;

  return { totalBudgeted, totalSpent, totalRemaining, percentUsed, budgetCount: rows.length };
}

export function upsertBudget(categoryId: string, amountCents: number) {
  const existing = db
    .select()
    .from(schema.budgets)
    .where(eq(schema.budgets.categoryId, categoryId))
    .get();

  if (existing) {
    db.update(schema.budgets)
      .set({ amount: amountCents })
      .where(eq(schema.budgets.id, existing.id))
      .run();
    return existing.id;
  }

  const id = newId();
  db.insert(schema.budgets)
    .values({ id, categoryId, amount: amountCents, period: "monthly", createdAt: now() })
    .run();
  return id;
}

export function deleteBudget(budgetId: string) {
  db.delete(schema.budgets).where(eq(schema.budgets.id, budgetId)).run();
}

// ============================================================
// BUDGET STRATEGY — Phase + allocation + goal commitments
// ============================================================

export type BudgetPhase = "stop_bleed" | "build_buffer" | "save";

export type AllocationBucket = {
  key: AllocationBucketKey;
  label: string;
  cents: number;             // trailing-30 actual spend (reference only)
  mtdCents: number;          // calendar-MTD actual spend (current month so far)
  projectedCents: number;    // projected EOM spend = MTD-pace × days_in_month, summed across categories
  plannedCents: number;      // "if budgets honored" — uses budget when set, else trailing-30
  budgetedCents: number;     // sum of budgets explicitly set in this bucket (independent of actuals)
  hasBudgetCoverage: boolean; // true when at least one category in the bucket has a budget set
  categories: { categoryId: string; name: string; cents: number; mtdCents: number; projectedCents: number; budgetCents: number | null; color: string | null }[];
};

export type BudgetStrategy = {
  phase: BudgetPhase;
  phaseLabel: string;
  phaseDetail: string;

  // Income — two views shown explicitly. Recurring = predictable base for
  // strategic decisions. Trailing-30 actual = what actually landed (may
  // include ad-hoc inflows like A.S. Infinite payroll).
  incomeRecurringMonthly: number;
  incomeActualTrailing30: number;
  incomeBreakdown: { merchant: string; monthly: number; frequency: string }[];

  // Allocation (trailing-30 actuals, classified by category bucket)
  buckets: {
    committed: AllocationBucket;
    essential: AllocationBucket;
    operational: AllocationBucket;
    discretionary: AllocationBucket;
  };
  unclassifiedSpendCents: number;       // categories with no bucket mapping
  totalExpensesMonthly: number;          // sum of all four buckets + unclassified (trailing-30 reference)
  surplusMonthly: number;                // recurring income − total trailing-30 expenses (reference)

  // Calendar-month projection — the new primary frame. MTD spend extrapolated
  // to month-end at current pace per category. This is "where May is going to
  // land if nothing changes" — the most useful number for decisions.
  totalProjectedExpenses: number;
  projectedSurplus: number;
  daysElapsedThisMonth: number;
  daysInThisMonth: number;
  projectionConfidence: "thin" | "ok" | "strong";  // "thin" = day < 7, projection noisy

  // Real accounting — sourced from cash-flow forecast. Today's balance walked
  // forward through scheduled bills + paychecks + budget-capped discretionary.
  // The HEADLINE truth metric: "where will my balance be at end of month?"
  // This replaces trailing-30 surplus (which was contaminated by one-off
  // expenses like dental bills) with proper accrual accounting.
  todayBalanceCents: number;
  projectedEomBalanceCents: number;          // end of current calendar month
  projectedRestOfMonthNet: number;            // EOM − today (positive = building)
  projectedNextMonthEndBalanceCents: number; // end of next calendar month
  projectedNextMonthNet: number;              // next-month-end − this-month-end (a "full month" cycle)

  // Next-7-day pulse — the "you are here" anchor. EOM hides the trough that
  // happens between today and the next paycheck; this surfaces it.
  next7DayTrough: { balanceCents: number; date: string } | null;
  nextIncomeEvent: { date: string; amountCents: number } | null;
  survivalFloorCents: number;
  troughBreachesFloor: boolean;

  // Plan-aware totals — what the picture would be if every category honored
  // its set budget. Categories without a budget default to actual. Editing a
  // budget below directly moves these numbers, which is what the user expects.
  totalPlannedExpenses: number;
  plannedSurplus: number;
  totalBudgetedCents: number;            // sum of all set budgets across all buckets
  totalSetBudgetsCount: number;
  budgetCoveragePercent: number;         // % of trailing-30 spend that's in a budgeted category

  // Kill list integration — what would Operational drop to if all kill-list subs cancel?
  killListMonthlySavings: number;

  // Buffer state
  bufferTargetCents: number;
  bufferCurrentCents: number;
  bufferRemainingCents: number;
  bufferPercent: number;
  bufferEtaMonths: number | null;

  // Move plan
  moveTargetCents: number;
  moveSavedCents: number;
  moveRemainingCents: number;
  moveRequiredPaceCents: number;
  moveDate: string | null;
  moveMonthsRemaining: number | null;
  moveUnlocked: boolean; // user override — start saving for Houston before buffer is full

  // Earmarks
  earmarkedCents: number;
  totalSavingsCents: number;
};

export const getBudgetStrategy = cache(_getBudgetStrategy);
function _getBudgetStrategy(): BudgetStrategy {
  // === Income: recurring paychecks (predictable base) ===
  const recurring = db
    .select({
      merchant: schema.recurringTransactions.merchant,
      amount: schema.recurringTransactions.amount,
      frequency: schema.recurringTransactions.frequency,
      groupName: schema.categoryGroups.name,
      categoryId: schema.recurringTransactions.categoryId,
    })
    .from(schema.recurringTransactions)
    .leftJoin(schema.categories, eq(schema.recurringTransactions.categoryId, schema.categories.id))
    .leftJoin(schema.categoryGroups, eq(schema.categories.groupId, schema.categoryGroups.id))
    .where(eq(schema.recurringTransactions.isActive, true))
    .all();

  const monthlize = (amt: number, freq: string): number => {
    switch (freq) {
      case "monthly": return amt;
      case "biweekly": return Math.round(amt * 26 / 12);
      case "weekly": return Math.round(amt * 52 / 12);
      case "yearly": return Math.round(amt / 12);
      default: return amt;
    }
  };

  const internalCats = new Set(getInternalCategoryIds());
  let incomeRecurringMonthly = 0;
  const incomeBreakdown: { merchant: string; monthly: number; frequency: string }[] = [];
  for (const r of recurring) {
    if (r.categoryId && internalCats.has(r.categoryId)) continue;
    if (r.groupName === "Internal") continue;
    if (r.groupName === "Income") {
      const monthly = monthlize(r.amount, r.frequency);
      incomeRecurringMonthly += monthly;
      incomeBreakdown.push({ merchant: r.merchant, monthly, frequency: r.frequency });
    }
  }
  incomeBreakdown.sort((a, b) => b.monthly - a.monthly);

  // === Trailing-30 income actual ===
  const today = new Date();
  const t30 = new Date(today);
  t30.setDate(t30.getDate() - 30);
  const t30Str = t30.toISOString().split("T")[0];
  const todayStr = today.toISOString().split("T")[0];
  const excludedAccounts = getExcludedAccountIds();
  const internalCatsArr = [...internalCats];

  // Trailing-30 income — strip detected internal-transfer "deposits" so the
  // number reflects real new money, not the same paycheck moving across
  // accounts. The merchant-name patterns mirror what the Transfers categorizer
  // catches; if a transfer slipped through to Income classification, we still
  // want to drop it from the headline.
  const incomeRows = db
    .select({
      merchant: schema.transactions.merchant,
      amount: schema.transactions.amount,
    })
    .from(schema.transactions)
    .where(and(
      eq(schema.transactions.type, "income"),
      gte(schema.transactions.date, t30Str),
      lte(schema.transactions.date, todayStr),
      excludedAccounts.length > 0 ? notInArray(schema.transactions.accountId, excludedAccounts) : undefined,
    ))
    .all();
  const TRANSFER_MERCHANT_PATTERN = /deposit from\s+(capital one|simply checking|360|business basic|chime|navy fed|membership share|everyday)|moved (from|to) checking|round up|transfer from|transfer to/i;
  let incomeActualTrailing30 = 0;
  for (const row of incomeRows) {
    if (row.merchant && TRANSFER_MERCHANT_PATTERN.test(row.merchant)) continue;
    incomeActualTrailing30 += row.amount;
  }

  // === Trailing-30 expenses, classified into buckets ===
  const expenseRows = db
    .select({
      categoryId: schema.transactions.categoryId,
      categoryName: schema.categories.name,
      categoryColor: schema.categories.color,
      total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)`,
    })
    .from(schema.transactions)
    .leftJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
    .where(and(
      eq(schema.transactions.type, "expense"),
      gte(schema.transactions.date, t30Str),
      lte(schema.transactions.date, todayStr),
      internalCatsArr.length > 0 ? notInArray(schema.transactions.categoryId, internalCatsArr) : undefined,
      excludedAccounts.length > 0 ? notInArray(schema.transactions.accountId, excludedAccounts) : undefined,
    ))
    .groupBy(schema.transactions.categoryId)
    .all();

  // Pull all budgets keyed by categoryId so we can join per-category and
  // compute "planned" totals (uses budget when set, else actual).
  const allBudgets = db
    .select({ categoryId: schema.budgets.categoryId, amount: schema.budgets.amount })
    .from(schema.budgets)
    .all();
  const budgetByCategoryId = new Map<string, number>();
  for (const b of allBudgets) {
    if (b.categoryId) budgetByCategoryId.set(b.categoryId, b.amount);
  }

  const buckets: BudgetStrategy["buckets"] = {
    committed: { key: "committed", label: "Committed", cents: 0, mtdCents: 0, projectedCents: 0, plannedCents: 0, budgetedCents: 0, hasBudgetCoverage: false, categories: [] },
    essential: { key: "essential", label: "Essential", cents: 0, mtdCents: 0, projectedCents: 0, plannedCents: 0, budgetedCents: 0, hasBudgetCoverage: false, categories: [] },
    operational: { key: "operational", label: "Operational", cents: 0, mtdCents: 0, projectedCents: 0, plannedCents: 0, budgetedCents: 0, hasBudgetCoverage: false, categories: [] },
    discretionary: { key: "discretionary", label: "Discretionary", cents: 0, mtdCents: 0, projectedCents: 0, plannedCents: 0, budgetedCents: 0, hasBudgetCoverage: false, categories: [] },
  };

  // Calendar-month bookkeeping for projection math.
  const daysInThisMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysElapsedThisMonth = today.getDate();
  // Projected EOM = max(MTD, trailing-30 normalized to days-in-month).
  // Why not pure MTD-pace? Because that multiplies once-a-month bills like
  // rent across 31 days, blowing up the projection on the day rent posts.
  // Trailing-30 already approximates a monthly figure; we only let MTD win
  // when the user is genuinely ahead of their typical pace this month.
  const projectMonth = (mtd: number, trailing30: number): number => {
    const trailing30Normalized = Math.round(trailing30 / 30 * daysInThisMonth);
    return Math.max(mtd, trailing30Normalized);
  };

  // Calendar-MTD spend by category (so each bucket card can show "this month so far"
  // alongside the trailing-30 view). Querying separately because trailing-30 and MTD
  // have different date ranges.
  const monthStartIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const mtdRows = db
    .select({
      categoryId: schema.transactions.categoryId,
      categoryName: schema.categories.name,
      total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)`,
    })
    .from(schema.transactions)
    .leftJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
    .where(and(
      eq(schema.transactions.type, "expense"),
      gte(schema.transactions.date, monthStartIso),
      lte(schema.transactions.date, todayStr),
      internalCatsArr.length > 0 ? notInArray(schema.transactions.categoryId, internalCatsArr) : undefined,
      excludedAccounts.length > 0 ? notInArray(schema.transactions.accountId, excludedAccounts) : undefined,
    ))
    .groupBy(schema.transactions.categoryId)
    .all();
  const mtdByCategoryId = new Map<string, number>();
  for (const row of mtdRows) {
    if (!row.categoryName) continue;
    if (!row.categoryId) continue;
    const bucketKey = CATEGORY_BUCKETS[row.categoryName];
    if (!bucketKey) continue;
    buckets[bucketKey].mtdCents += row.total;
    mtdByCategoryId.set(row.categoryId, row.total);
  }
  // Note: per-bucket projectedCents is computed below as we walk expenseRows
  // (trailing-30) so we have both MTD and trailing-30 for the projection formula.
  let unclassifiedSpendCents = 0;
  let spendInBudgetedCategories = 0;
  for (const row of expenseRows) {
    if (!row.categoryName || !row.categoryId) {
      unclassifiedSpendCents += row.total;
      continue;
    }
    const bucketKey = CATEGORY_BUCKETS[row.categoryName];
    if (!bucketKey) {
      unclassifiedSpendCents += row.total;
      continue;
    }
    const budgetCents = budgetByCategoryId.get(row.categoryId) ?? null;
    const b = buckets[bucketKey];
    b.cents += row.total;
    // Planned = budget if set, else actual. Budgets you've set override the
    // historical reality — that's the whole point of "planning."
    b.plannedCents += budgetCents ?? row.total;
    if (budgetCents !== null) {
      b.budgetedCents += budgetCents;
      b.hasBudgetCoverage = true;
      spendInBudgetedCategories += row.total;
    }
    const catMtd = mtdByCategoryId.get(row.categoryId) ?? 0;
    const catProjected = projectMonth(catMtd, row.total);
    b.categories.push({
      categoryId: row.categoryId,
      name: row.categoryName,
      cents: row.total,
      mtdCents: catMtd,
      projectedCents: catProjected,
      budgetCents,
      color: row.categoryColor,
    });
    // Aggregate up to bucket level here too, where we have both numbers handy.
    b.projectedCents += catProjected;
  }
  // Also fold in budgets for categories with NO trailing-30 spend — a $200
  // Restaurants budget where you spent $0 still belongs in Discretionary.plannedCents
  // and should appear as a row in the bucket drill-down with $0 actual.
  for (const [categoryId, amount] of budgetByCategoryId) {
    const cat = db.select({ name: schema.categories.name, color: schema.categories.color }).from(schema.categories).where(eq(schema.categories.id, categoryId)).get();
    if (!cat?.name) continue;
    const bucketKey = CATEGORY_BUCKETS[cat.name];
    if (!bucketKey) continue;
    const alreadyCounted = buckets[bucketKey].categories.some((c) => c.categoryId === categoryId);
    if (alreadyCounted) continue;
    buckets[bucketKey].plannedCents += amount;
    buckets[bucketKey].budgetedCents += amount;
    buckets[bucketKey].hasBudgetCoverage = true;
    // Surface in drill-down too — $0 actual but real budget commitment.
    const mtdForCat = mtdByCategoryId.get(categoryId) ?? 0;
    const projected = projectMonth(mtdForCat, 0); // 0 trailing-30 since not in expenseRows
    buckets[bucketKey].categories.push({
      categoryId,
      name: cat.name,
      cents: 0,
      mtdCents: mtdForCat,
      projectedCents: projected,
      budgetCents: amount,
      color: cat.color,
    });
    buckets[bucketKey].projectedCents += projected;
  }

  // Sort each bucket's categories by spend descending for display.
  for (const k of Object.keys(buckets) as AllocationBucketKey[]) {
    buckets[k].categories.sort((a, b) => b.cents - a.cents);
  }

  const totalExpensesMonthly =
    buckets.committed.cents +
    buckets.essential.cents +
    buckets.operational.cents +
    buckets.discretionary.cents +
    unclassifiedSpendCents;
  const surplusMonthly = incomeRecurringMonthly - totalExpensesMonthly;

  const totalProjectedExpenses =
    buckets.committed.projectedCents +
    buckets.essential.projectedCents +
    buckets.operational.projectedCents +
    buckets.discretionary.projectedCents +
    unclassifiedSpendCents; // approximation — unclassified is a sliver, treat as flat
  const projectedSurplus = incomeRecurringMonthly - totalProjectedExpenses;
  const projectionConfidence: BudgetStrategy["projectionConfidence"] =
    daysElapsedThisMonth < 7 ? "thin" : daysElapsedThisMonth < 14 ? "ok" : "strong";

  // === Real accounting via cash flow forecast ===
  // Today's balance walked forward through scheduled bills + paychecks +
  // budget-capped discretionary. This is the truth-teller: "starting balance,
  // run through the month, what do I end up with?" — basic accounting, not
  // trailing-30 averages.
  const cashFlow = getCashFlowForecast(75);
  const todayBalanceCents = cashFlow.startingBalance;
  const projectedEomBalanceCents = cashFlow.endOfMonthBalance;
  const projectedRestOfMonthNet = projectedEomBalanceCents - todayBalanceCents;
  const projectedNextMonthEndBalanceCents = cashFlow.endOfNextMonthBalance;
  const projectedNextMonthNet = projectedNextMonthEndBalanceCents - projectedEomBalanceCents;

  // === Next-7-day pulse — the "you are here" answer ===
  // Trough catches the cash crunch BEFORE it hits. EOM is a peak; the dangerous
  // dip is between today and the next paycheck (e.g. May 11 trough at $778
  // before Meridian May 12 lands). Surface it loudly.
  const pulseTodayStr = new Date().toISOString().split("T")[0];
  const next7Days = cashFlow.data
    .filter((d) => d.isProjected && d.date > pulseTodayStr)
    .slice(0, 7);
  let troughBalance = todayBalanceCents;
  let troughDate: string | null = null;
  for (const d of next7Days) {
    // Strict < so trough only registers when the next 7 days dip BELOW today.
    // <= would set troughDate even on flat lines, then the UI's `< today` check
    // would suppress the inline span — inconsistent with the warning banner.
    if (d.projectedBalance < troughBalance) {
      troughBalance = d.projectedBalance;
      troughDate = d.date;
    }
  }
  // Walk forward to find the next day with income > 0 (any size — paycheck,
  // refund, etc.). Used to anchor "money relief is X days away" framing.
  const nextIncomeEntry = cashFlow.data.find((d) => d.isProjected && d.income > 0);
  const next7DayTrough = troughDate
    ? { balanceCents: troughBalance, date: troughDate }
    : null;
  const nextIncomeEvent = nextIncomeEntry
    ? { date: nextIncomeEntry.date, amountCents: nextIncomeEntry.income }
    : null;
  const survivalFloorCents = cashFlow.survivalFloor;
  const troughBreachesFloor = next7DayTrough !== null && next7DayTrough.balanceCents < survivalFloorCents;

  const totalPlannedExpenses =
    buckets.committed.plannedCents +
    buckets.essential.plannedCents +
    buckets.operational.plannedCents +
    buckets.discretionary.plannedCents +
    unclassifiedSpendCents; // unclassified flows through unchanged — no budget to honor

  const plannedSurplus = incomeRecurringMonthly - totalPlannedExpenses;
  const totalBudgetedCents = allBudgets.reduce((s, b) => s + b.amount, 0);
  const totalSetBudgetsCount = allBudgets.length;
  const budgetCoveragePercent =
    totalExpensesMonthly > 0
      ? Math.round((spendInBudgetedCategories / totalExpensesMonthly) * 100)
      : 0;

  // === Kill-list integration — how much Operational could drop ===
  const subAudit = getSubscriptionAudit();
  const killListMonthlySavings = subAudit.killListMonthly;

  // === Savings + earmarks ===
  // Shared helper — keeps /budget GoalCommitments, /dashboard StrategicHero +
  // MoveTracker, and /move-planner reporting the same Houston-saved number.
  const savingsSplit = getMovableSavingsSplit();
  const totalSavingsCents = savingsSplit.totalSavingsCents;
  const earmarkedCents = savingsSplit.earmarkedCents;
  const movableSavings = savingsSplit.movableCents;
  const bufferCurrentCents = savingsSplit.bufferCurrentCents;
  const bufferRemainingCents = Math.max(0, BUFFER_TARGET_CENTS - bufferCurrentCents);
  const bufferPercent = Math.round((bufferCurrentCents / BUFFER_TARGET_CENTS) * 100);
  // bufferEtaMonths uses projectedNextMonthNet (real cash-flow accounting)
  // not surplusMonthly (trailing-30 noise). Without this, the ETA could read
  // "no surplus to save yet" while the user is actually netting +$3k/mo.
  const bufferEtaMonths =
    projectedNextMonthNet > 0 && bufferRemainingCents > 0
      ? Math.ceil(bufferRemainingCents / projectedNextMonthNet)
      : bufferRemainingCents === 0
        ? 0
        : null;

  // === Move plan (Houston) ===
  const movePlan = db
    .select()
    .from(schema.financialPlans)
    .where(eq(schema.financialPlans.type, "move"))
    .get();
  const moveTargetCents = movePlan?.targetAmount ?? 0;
  const moveDate = movePlan?.targetDate ?? null;
  const moveSavedCents = savingsSplit.houstonSavedCents;
  const moveRemainingCents = Math.max(0, moveTargetCents - moveSavedCents);
  let moveMonthsRemaining: number | null = null;
  if (moveDate) {
    const moveDateObj = new Date(moveDate + "T00:00:00");
    const nowDate = new Date();
    nowDate.setHours(0, 0, 0, 0);
    moveMonthsRemaining = Math.max(
      0,
      (moveDateObj.getFullYear() - nowDate.getFullYear()) * 12 + (moveDateObj.getMonth() - nowDate.getMonth()),
    );
  }
  const moveRequiredPaceCents =
    moveMonthsRemaining && moveMonthsRemaining > 0
      ? Math.ceil(moveRemainingCents / moveMonthsRemaining)
      : 0;

  // Houston unlock — user can override the "buffer first" gate.
  const unlockRow = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "houston_unlock"))
    .get();
  const moveUnlocked = unlockRow?.value === "true";

  // === Phase + dynamic detail (embeds top suggestion specifics) ===
  // We compute suggestions once here so the phase detail can reference them.
  const suggestions = computeSuggestions();
  const topSuggestion = suggestions.find((s) => s.priority === "high") ?? suggestions[0] ?? null;

  let phase: BudgetPhase;
  let phaseLabel: string;
  let phaseDetail: string;
  // Phase determination uses real next-full-month projected net (cash flow
  // accounting). This is "starting balance + all income - all expenses for the
  // month" — proper accrual, not trailing-30 averages. Negative = losing money
  // each cycle; positive = building.
  if (projectedNextMonthNet < 0) {
    phase = "stop_bleed";
    phaseLabel = "Phase 1 — Stop the Bleed";
    if (topSuggestion) {
      const pct = Math.min(100, Math.round((topSuggestion.monthlyDelta / Math.abs(projectedNextMonthNet)) * 100));
      phaseDetail = `Full-month cycle projecting ${formatCurrencyCompact(Math.abs(projectedNextMonthNet))} loss. ${topSuggestion.actionLabel} ${topSuggestion.categoryName} alone closes ${pct}% of it.`;
    } else {
      phaseDetail = `Full-month cycle projecting ${formatCurrencyCompact(Math.abs(projectedNextMonthNet))} loss. No clear cut targets — review categories.`;
    }
  } else if (bufferCurrentCents < BUFFER_TARGET_CENTS) {
    phase = "build_buffer";
    phaseLabel = "Phase 2 — Build the Buffer";
    const monthlyPace = projectedNextMonthNet;
    const eta = monthlyPace > 0 ? Math.ceil(bufferRemainingCents / monthlyPace) : null;
    const paceText = eta !== null ? `~${eta} mo at +${formatCurrencyCompact(monthlyPace)}/mo net` : "no surplus yet";
    phaseDetail = `Build ${formatCurrencyCompact(bufferRemainingCents)} more buffer before Houston (${paceText}). Prevents missed obligations during cash crunches.`;
  } else {
    phase = "save";
    phaseLabel = "Phase 3 — Save & Grow";
    phaseDetail = `Buffer full. Houston needs ${formatCurrencyCompact(moveRequiredPaceCents)}/mo to hit ${moveDate ?? "target"}. Surplus beyond that → debt avalanche extras.`;
  }

  return {
    phase,
    phaseLabel,
    phaseDetail,
    incomeRecurringMonthly,
    incomeActualTrailing30,
    incomeBreakdown,
    buckets,
    unclassifiedSpendCents,
    totalExpensesMonthly,
    surplusMonthly,
    totalProjectedExpenses,
    projectedSurplus,
    daysElapsedThisMonth,
    daysInThisMonth,
    projectionConfidence,
    todayBalanceCents,
    projectedEomBalanceCents,
    projectedRestOfMonthNet,
    projectedNextMonthEndBalanceCents,
    next7DayTrough,
    nextIncomeEvent,
    survivalFloorCents,
    troughBreachesFloor,
    projectedNextMonthNet,
    totalPlannedExpenses,
    plannedSurplus,
    totalBudgetedCents,
    totalSetBudgetsCount,
    budgetCoveragePercent,
    killListMonthlySavings,
    bufferTargetCents: BUFFER_TARGET_CENTS,
    bufferCurrentCents,
    bufferRemainingCents,
    bufferPercent,
    bufferEtaMonths,
    moveTargetCents,
    moveSavedCents,
    moveRemainingCents,
    moveRequiredPaceCents,
    moveDate,
    moveMonthsRemaining,
    moveUnlocked,
    earmarkedCents,
    totalSavingsCents,
  };
}



// ============================================================
// BUDGET SUGGESTIONS — strategy-driven cut proposals
// ============================================================

export type SuggestionMode = "set" | "tighten" | "realign";

export type BudgetSuggestion = {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  groupName: string | null;
  current30dSpend: number;
  currentBudget: number | null;
  suggestedBudget: number;
  monthlyDelta: number;       // current − suggested. For "realign," delta is *current − new realistic budget*.
  reasoning: string;
  priority: "high" | "medium" | "low";
  mode: SuggestionMode;
  actionLabel: string;        // dynamic verb for the button + phase detail ("Halve", "Tighten", "Realign")
};

/** Per-category cut targets driven by the strategy. Factor is target as a
 *  fraction of trailing-30 spend. Categories not in this map don't get
 *  surfaced as suggestions. */
const CUT_RULES: Record<string, { factor: number; reason: string; verb: string }> = {
  "Vape & Tobacco": { factor: 0, reason: "Hard cut — health + cost", verb: "Eliminate" },
  "Adult Content": { factor: 0, reason: "Hard cut — easy savings", verb: "Eliminate" },
  "Peer-to-Peer": { factor: 0, reason: "Cut impulse Apple Cash sends", verb: "Zero out" },

  "Restaurants": { factor: 0.5, reason: "Halve eating out — biggest discretionary lever (covers all dining/fast food)", verb: "Halve" },
  "Coffee & Cafes": { factor: 0.5, reason: "Brew at home half the time", verb: "Halve" },
  // Dining + Fast Food merged into Restaurants — kept here for safety in case a
  // Teller sync ever recreates them.
  "Fast Food": { factor: 0.5, reason: "Should be merged into Restaurants — recategorize", verb: "Recategorize" },
  "Dining": { factor: 0.5, reason: "Should be merged into Restaurants — recategorize", verb: "Recategorize" },

  "Shopping": { factor: 0.6, reason: "Cap impulse purchases at 60% of trailing 30d", verb: "Cap" },
  "Clothing & Fashion": { factor: 0.6, reason: "Cap clothing at 60% — buy on need not want", verb: "Cap" },
  "Books & Education": { factor: 0.6, reason: "Library + sample first", verb: "Cap" },

  "Entertainment": { factor: 0.7, reason: "Trim 30% — keep some fun", verb: "Trim" },
  "Other": { factor: 0.7, reason: "Catch-all — recategorize first if possible", verb: "Trim" },
};

/** Dismissed suggestion IDs with 30-day cooldown. Stored as JSON map
 *  { categoryId: ISO timestamp } in settings. */
function getDismissedSuggestions(): Set<string> {
  const row = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "dismissed_budget_suggestions"))
    .get();
  if (!row) return new Set();
  try {
    const parsed = JSON.parse(row.value);
    if (typeof parsed !== "object" || parsed === null) return new Set();
    const result = new Set<string>();
    const cutoff = Date.now() - 30 * 86400000; // 30-day cooldown
    for (const [catId, dismissedAt] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof dismissedAt === "string" && new Date(dismissedAt).getTime() > cutoff) {
        result.add(catId);
      }
    }
    return result;
  } catch {
    return new Set();
  }
}

/** Internal — used by both getBudgetSuggestions (public) and the strategy's
 *  phase-detail builder. Filters dismissed entries. */
function computeSuggestions(): BudgetSuggestion[] {
  const internalCats = getInternalCategoryIds();
  const excludedAccounts = getExcludedAccountIds();
  const dismissed = getDismissedSuggestions();
  const hiddenNames = getHiddenCategoryNames();

  const today = new Date();
  const t30 = new Date(today);
  t30.setDate(t30.getDate() - 30);
  const t30Str = t30.toISOString().split("T")[0];
  const todayStr = today.toISOString().split("T")[0];

  const spendRows = db
    .select({
      categoryId: schema.transactions.categoryId,
      categoryName: schema.categories.name,
      categoryColor: schema.categories.color,
      groupName: schema.categoryGroups.name,
      total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)`,
    })
    .from(schema.transactions)
    .leftJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
    .leftJoin(schema.categoryGroups, eq(schema.categories.groupId, schema.categoryGroups.id))
    .where(and(
      eq(schema.transactions.type, "expense"),
      gte(schema.transactions.date, t30Str),
      lte(schema.transactions.date, todayStr),
      internalCats.length > 0 ? notInArray(schema.transactions.categoryId, internalCats) : undefined,
      excludedAccounts.length > 0 ? notInArray(schema.transactions.accountId, excludedAccounts) : undefined,
    ))
    .groupBy(schema.transactions.categoryId)
    .all();

  const existingBudgets = db
    .select({ categoryId: schema.budgets.categoryId, amount: schema.budgets.amount })
    .from(schema.budgets)
    .all();
  const budgetMap = Object.fromEntries(existingBudgets.map((b) => [b.categoryId, b.amount]));

  const out: BudgetSuggestion[] = [];
  for (const row of spendRows) {
    if (!row.categoryId || !row.categoryName) continue;
    if (dismissed.has(row.categoryId)) continue;
    if (hiddenNames.has(row.categoryName)) continue;

    const rule = CUT_RULES[row.categoryName];
    if (!rule) continue;

    const current = row.total;
    if (current < 1000) continue; // sub-$10 noise

    const idealTarget = Math.round(current * rule.factor);
    const currentBudget = budgetMap[row.categoryId] ?? null;

    let mode: SuggestionMode;
    let suggestedBudget: number;
    let reasoning: string;
    let actionLabel: string;

    if (currentBudget === null) {
      // No budget yet — propose ideal target.
      mode = "set";
      suggestedBudget = idealTarget;
      reasoning = rule.reason;
      actionLabel = rule.verb;
    } else {
      const honoring = current <= currentBudget * 1.2; // within 20% of budget = on track

      if (honoring && currentBudget <= idealTarget) {
        // Already at or below ideal — nothing to suggest.
        continue;
      }

      if (honoring && currentBudget > idealTarget) {
        // User has a budget but ideal is tighter — propose lowering it.
        mode = "tighten";
        suggestedBudget = idealTarget;
        reasoning = `Honoring ${formatCurrencyCompact(currentBudget)}/mo budget — push lower to ${formatCurrencyCompact(idealTarget)}/mo for more savings`;
        actionLabel = "Tighten";
      } else {
        // All other cases skip:
        // - User is blowing a tight budget: covered by BLOWN action queue row
        //   (behavioral fix, not a budget config fix). Don't suggest raising.
        // - User is close but not honoring: noise, skip.
        // Realigning UP a budget the user just set deliberately is presumptuous;
        // they tightened on purpose. The BLOWN row already says "you're over."
        continue;
      }
    }

    const monthlyDelta = current - suggestedBudget;
    const priority: "high" | "medium" | "low" =
      monthlyDelta >= 10000 ? "high" : monthlyDelta >= 2500 ? "medium" : "low";

    out.push({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      categoryColor: row.categoryColor ?? "#6b7280",
      groupName: row.groupName,
      current30dSpend: current,
      currentBudget,
      suggestedBudget,
      monthlyDelta,
      reasoning,
      priority,
      mode,
      actionLabel,
    });
  }

  return out.sort((a, b) => b.monthlyDelta - a.monthlyDelta);
}

export function getBudgetSuggestions(): BudgetSuggestion[] {
  return computeSuggestions();
}

// ============================================================
// SETTINGS-BACKED USER PREFERENCES
// ============================================================

/** Dismiss a suggestion for 30 days. Idempotent — calling twice resets the timestamp. */
export function dismissBudgetSuggestion(categoryId: string) {
  const row = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "dismissed_budget_suggestions"))
    .get();

  let map: Record<string, string> = {};
  if (row) {
    try {
      const parsed = JSON.parse(row.value);
      if (typeof parsed === "object" && parsed !== null) map = parsed as Record<string, string>;
    } catch { /* malformed — start fresh */ }
  }
  map[categoryId] = new Date().toISOString();
  const value = JSON.stringify(map);

  if (row) {
    db.update(schema.settings)
      .set({ value, updatedAt: now() })
      .where(eq(schema.settings.key, "dismissed_budget_suggestions"))
      .run();
  } else {
    db.insert(schema.settings)
      .values({ key: "dismissed_budget_suggestions", value, updatedAt: now() })
      .run();
  }
}

/** Override the buffer-first lock so user can allocate to Houston now.
 *  Persisted across sessions — they can re-lock by passing false. */
export function setHoustonUnlock(unlocked: boolean) {
  const value = unlocked ? "true" : "false";
  const row = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "houston_unlock"))
    .get();
  if (row) {
    db.update(schema.settings)
      .set({ value, updatedAt: now() })
      .where(eq(schema.settings.key, "houston_unlock"))
      .run();
  } else {
    db.insert(schema.settings)
      .values({ key: "houston_unlock", value, updatedAt: now() })
      .run();
  }
}

// ============================================================
// CATEGORY DAILY-PACE TRACKER
// Generic helper that powers the Restaurants daily tracker on /budget. Keeps
// the comparison simple: today's spend, MTD vs budget, projected EOM, days-of-budget-remaining.
// ============================================================
export type CategoryDailyPace = {
  categoryName: string;
  categoryColor: string;
  budgetCents: number;
  todayCents: number;
  yesterdayCents: number;
  mtdCents: number;
  projectedMonthCents: number; // mtd / daysElapsed * daysInMonth
  daysElapsed: number;
  daysInMonth: number;
  daysOfBudgetLeft: number | null;  // (budget − mtd) / dailyAvgSoFar; null if 0 spend
  status: "on_pace" | "warn" | "over";
  paceVsBudgetPercent: number;       // 100% = exactly on pace
};

export function getCategoryDailyPace(categoryName: string): CategoryDailyPace | null {
  const cat = db.select().from(schema.categories).where(eq(schema.categories.name, categoryName)).get();
  if (!cat) return null;

  const budget = db.select().from(schema.budgets).where(eq(schema.budgets.categoryId, cat.id)).get();
  const budgetCents = budget?.amount ?? 0;

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const todayStr = today.toISOString().split("T")[0];
  const yesterdayStr = yesterday.toISOString().split("T")[0];
  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysElapsed = today.getDate();

  const excludedAccounts = getExcludedAccountIds();

  const sumFor = (start: string, end: string): number => {
    const row = db
      .select({ total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)` })
      .from(schema.transactions)
      .where(and(
        eq(schema.transactions.type, "expense"),
        eq(schema.transactions.categoryId, cat.id),
        gte(schema.transactions.date, start),
        lte(schema.transactions.date, end),
        excludedAccounts.length > 0 ? notInArray(schema.transactions.accountId, excludedAccounts) : undefined,
      ))
      .get();
    return row?.total ?? 0;
  };

  const todayCents = sumFor(todayStr, todayStr);
  const yesterdayCents = sumFor(yesterdayStr, yesterdayStr);
  const mtdCents = sumFor(monthStart, todayStr);
  const dailyAvgSoFar = daysElapsed > 0 ? mtdCents / daysElapsed : 0;
  const projectedMonthCents = Math.round(dailyAvgSoFar * daysInMonth);

  // "Days of budget remaining" — at the user's current daily-burn rate, how
  // many more days until they exhaust the budget.
  const daysOfBudgetLeft =
    dailyAvgSoFar > 0 && budgetCents > mtdCents
      ? Math.floor((budgetCents - mtdCents) / dailyAvgSoFar)
      : dailyAvgSoFar > 0
        ? 0
        : null;

  // Pace status: <= 100% expected pace = on_pace, 100-150% = warn, >150% = over.
  const expectedMtd = budgetCents > 0 ? (budgetCents / daysInMonth) * daysElapsed : 0;
  const paceVsBudgetPercent = expectedMtd > 0 ? Math.round((mtdCents / expectedMtd) * 100) : 0;
  let status: CategoryDailyPace["status"] = "on_pace";
  if (budgetCents > 0) {
    if (paceVsBudgetPercent > 150) status = "over";
    else if (paceVsBudgetPercent > 100) status = "warn";
  }

  return {
    categoryName,
    categoryColor: cat.color ?? "#6b7280",
    budgetCents,
    todayCents,
    yesterdayCents,
    mtdCents,
    projectedMonthCents,
    daysElapsed,
    daysInMonth,
    daysOfBudgetLeft,
    status,
    paceVsBudgetPercent,
  };
}

// ============================================================
// UNIFIED ACTION QUEUE
// One ranked list of every action the user could take from /budget. Replaces
// scattered "suggested cuts" + "kill list teaser" + "Restaurants tracker" +
// "autopay reminder" surfaces with a single priority-ordered queue. Each
// action has an explicit CTA the page can render as a button.
// ============================================================
export type ActionKind =
  | "honor_blown_budget"   // user has a budget they're blowing — discipline target
  | "apply_suggestion"     // suggested-cut row (Set/Tighten/Realign)
  | "kill_subscription"    // operational sub flagged on /reports kill list
  | "set_autopay"          // active debt without autopay confirmed
  | "pace_warning";        // discretionary category trending way over

export type ActionItem = {
  id: string;                 // stable key
  kind: ActionKind;
  priority: "high" | "medium" | "low";
  title: string;              // short — appears in card row
  detail: string;             // one-line context
  monthlyImpact: number;      // cents; how much this action saves/protects per month (0 if N/A)
  ctaLabel: string;           // button text
  ctaType: "scroll" | "link" | "tag";  // how the UI handles it
  ctaTarget: string;          // anchor id, route, or tag-merchant key
  // Visual link to the budget table — same dot color, same scroll target.
  categoryColor?: string;
  categoryGroup?: string;
  currentBudgetCents?: number; // null = no budget set yet
  currentSpendCents?: number;  // trailing-30 actual
  suggestedBudgetCents?: number; // target for Realign/Tighten/Halve/etc.
  mtdCents?: number;
  // Type-specific payloads
  categoryId?: string;
  merchant?: string;
  debtId?: string;
};

/** Top of /budget's action panel + the "Action of the Week" CTA strip both
 *  read from this queue. Sorted by (priority desc, monthlyImpact desc). */
export function getActionQueue(): ActionItem[] {
  const out: ActionItem[] = [];

  // 1. Honor blown budgets — categories where actual >> budget. The single
  //    biggest behavioral lever and almost always the top action.
  const overview = getBudgetOverview();
  for (const row of overview) {
    if (row.budgeted <= 0) continue;
    const overage = row.spent - row.budgeted;
    if (overage < 5000) continue; // < $50 over isn't worth nagging
    if (row.percentUsed < 110) continue;
    const priority: ActionItem["priority"] =
      overage >= 30000 ? "high" : overage >= 10000 ? "medium" : "low";
    out.push({
      id: `honor:${row.categoryId}`,
      kind: "honor_blown_budget",
      priority,
      title: `Honor ${row.categoryName} budget`,
      detail: `${formatCurrencyCompact(row.spent)} spent vs ${formatCurrencyCompact(row.budgeted)} budget · ${formatCurrencyCompact(overage)} over`,
      monthlyImpact: overage,
      ctaLabel: "Open budget",
      ctaType: "link",
      ctaTarget: "/budget",
      categoryId: row.categoryId,
      categoryColor: row.categoryColor,
      categoryGroup: row.groupName ?? undefined,
      currentBudgetCents: row.budgeted,
      currentSpendCents: row.spent,
    });
  }

  // 2. Suggested cuts — the existing Set/Tighten/Realign engine.
  const suggestions = computeSuggestions();
  for (const s of suggestions) {
    out.push({
      id: `suggest:${s.categoryId}`,
      kind: "apply_suggestion",
      priority: s.priority,
      title: `${s.actionLabel} ${s.categoryName}`,
      detail: s.currentBudget !== null
        ? `Currently budgeted at ${formatCurrencyCompact(s.currentBudget)} · spending ${formatCurrencyCompact(s.current30dSpend)} (30d) · target ${formatCurrencyCompact(s.suggestedBudget)}`
        : `No budget yet · spending ${formatCurrencyCompact(s.current30dSpend)} (30d) · suggest ${formatCurrencyCompact(s.suggestedBudget)}`,
      monthlyImpact: s.monthlyDelta,
      ctaLabel: s.actionLabel,
      ctaType: "tag",
      ctaTarget: s.categoryId,
      categoryId: s.categoryId,
      categoryColor: s.categoryColor,
      categoryGroup: s.groupName ?? undefined,
      currentBudgetCents: s.currentBudget ?? undefined,
      currentSpendCents: s.current30dSpend,
      suggestedBudgetCents: s.suggestedBudget,
    });
  }

  // 3. Kill-list candidates — operational subs already flagged on /reports.
  //    These are commit-to-cancel actions, surfaced here to make /budget a
  //    complete decision surface (no need to context-switch to /reports).
  const subAudit = getSubscriptionAudit();
  for (const sub of subAudit.killListSubs) {
    if (sub.flaggedCancel) continue; // already done
    out.push({
      id: `kill:${sub.merchant}`,
      kind: "kill_subscription",
      priority: sub.monthlyCost >= 5000 ? "high" : sub.monthlyCost >= 2000 ? "medium" : "low",
      title: `Cancel ${sub.merchant}`,
      detail: `On kill list · ${formatCurrencyCompact(sub.monthlyCost)}/mo · ${formatCurrencyCompact(sub.monthlyCost * 12)}/yr`,
      monthlyImpact: sub.monthlyCost,
      ctaLabel: "Mark cancelled",
      ctaType: "tag",
      ctaTarget: sub.merchant,
      merchant: sub.merchant,
    });
  }

  // 4. Autopay reminders — every active debt without auto-pay confirmed.
  //    Pure-waste category: late fees & interest are recoverable cash.
  const autopayStatuses = getAutopayStatuses();
  const lateFeesCat = db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.name, "Late Fees & Interest"))
    .get();
  let lateFeeMonthly = 0;
  if (lateFeesCat) {
    const t30Date = new Date();
    t30Date.setDate(t30Date.getDate() - 30);
    const row = db
      .select({ total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)` })
      .from(schema.transactions)
      .where(and(
        eq(schema.transactions.type, "expense"),
        eq(schema.transactions.categoryId, lateFeesCat.id),
        gte(schema.transactions.date, t30Date.toISOString().split("T")[0]),
      ))
      .get();
    lateFeeMonthly = row?.total ?? 0;
  }
  const missingAutopay = autopayStatuses.filter((a) => !a.enabled);
  if (missingAutopay.length > 0) {
    // Group all missing-autopay debts into ONE action — single trip to set them up.
    const debtRows = db
      .select({ minimumPayment: schema.debts.minimumPayment })
      .from(schema.debts)
      .where(inArray(schema.debts.id, missingAutopay.map((a) => a.debtId)))
      .all();
    const totalMins = debtRows.reduce((s, d) => s + d.minimumPayment, 0);
    out.push({
      id: "autopay:missing",
      kind: "set_autopay",
      priority: lateFeeMonthly > 10000 ? "high" : "medium",
      title: `Set auto-pay on ${missingAutopay.length} debt${missingAutopay.length === 1 ? "" : "s"}`,
      detail:
        lateFeeMonthly > 0
          ? `${formatCurrencyCompact(lateFeeMonthly)}/mo in late fees recoverable · ${formatCurrencyCompact(totalMins)} in minimums to cover`
          : `${formatCurrencyCompact(totalMins)} in minimums currently manual`,
      monthlyImpact: lateFeeMonthly, // late fees disappear with autopay
      ctaLabel: "Open /debts",
      ctaType: "link",
      ctaTarget: "/debts",
    });
  }

  // 5. Pace warnings — discretionary categories trending wildly over budget.
  //    Only emit if NOTHING else already covers this category (apply_suggestion
  //    or honor_blown_budget have stronger CTAs and would just duplicate).
  //    Batched: 2 queries cover all 4 categories vs. getCategoryDailyPace's 5/category.
  const categoriesAlreadyHandled = new Set(
    out.filter((a) => a.categoryId).map((a) => a.categoryId),
  );
  const paceCategoryNames = ["Restaurants", "Coffee & Cafes", "Fast Food", "Shopping"];
  const paceTodayDate = new Date();
  const paceMonthStart = `${paceTodayDate.getFullYear()}-${String(paceTodayDate.getMonth() + 1).padStart(2, "0")}-01`;
  const paceTodayStr = paceTodayDate.toISOString().split("T")[0];
  const paceDaysInMonth = new Date(paceTodayDate.getFullYear(), paceTodayDate.getMonth() + 1, 0).getDate();
  const paceDaysElapsed = paceTodayDate.getDate();
  const paceExcludedAccounts = getExcludedAccountIds();
  // One query: pace categories + their budgets in a single join.
  const paceCatRows = db
    .select({
      categoryId: schema.categories.id,
      categoryName: schema.categories.name,
      budgetCents: sql<number>`COALESCE(${schema.budgets.amount}, 0)`,
    })
    .from(schema.categories)
    .leftJoin(schema.budgets, eq(schema.budgets.categoryId, schema.categories.id))
    .where(inArray(schema.categories.name, paceCategoryNames))
    .all();
  const paceCatById = new Map(paceCatRows.map((r) => [r.categoryId, r]));
  // One query: MTD spend grouped by category for all four at once.
  const paceMtdRows = paceCatRows.length > 0
    ? db
        .select({
          categoryId: schema.transactions.categoryId,
          mtdCents: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)`,
        })
        .from(schema.transactions)
        .where(and(
          eq(schema.transactions.type, "expense"),
          inArray(schema.transactions.categoryId, paceCatRows.map((r) => r.categoryId)),
          gte(schema.transactions.date, paceMonthStart),
          lte(schema.transactions.date, paceTodayStr),
          paceExcludedAccounts.length > 0 ? notInArray(schema.transactions.accountId, paceExcludedAccounts) : undefined,
        ))
        .groupBy(schema.transactions.categoryId)
        .all()
    : [];
  const paceMtdById = new Map(paceMtdRows.map((r) => [r.categoryId, r.mtdCents]));
  for (const row of paceCatRows) {
    if (row.budgetCents === 0) continue;
    if (categoriesAlreadyHandled.has(row.categoryId)) continue;
    const mtdCents = paceMtdById.get(row.categoryId) ?? 0;
    const dailyAvg = paceDaysElapsed > 0 ? mtdCents / paceDaysElapsed : 0;
    const projectedMonthCents = Math.round(dailyAvg * paceDaysInMonth);
    const expectedMtd = (row.budgetCents / paceDaysInMonth) * paceDaysElapsed;
    const paceVsBudgetPercent = expectedMtd > 0 ? Math.round((mtdCents / expectedMtd) * 100) : 0;
    if (paceVsBudgetPercent < 200) continue; // not wildly over
    if (mtdCents > row.budgetCents) continue; // honor_blown_budget covers already-blown
    const projectedOverage = projectedMonthCents - row.budgetCents;
    if (projectedOverage < 5000) continue;
    out.push({
      id: `pace:${row.categoryName}`,
      kind: "pace_warning",
      priority: projectedOverage >= 30000 ? "high" : "medium",
      title: `${row.categoryName} on track to blow budget`,
      detail: `${formatCurrencyCompact(mtdCents)}/${formatCurrencyCompact(row.budgetCents)} MTD · projected ${formatCurrencyCompact(projectedMonthCents)} EOM`,
      monthlyImpact: projectedOverage,
      ctaLabel: "Open budget",
      ctaType: "link",
      ctaTarget: "/budget",
      categoryId: row.categoryId,
    });
  }

  // Category budgets are derived from the household plan now, so a suggested
  // cut is applied by editing the plan line — not by writing `budgets`.
  for (const a of out) {
    if (a.kind !== "apply_suggestion") continue;
    a.ctaLabel = "Open budget";
    a.ctaType = "link";
    a.ctaTarget = "/budget";
  }

  // Sort: priority desc, then monthlyImpact desc.
  const priorityRank = { high: 0, medium: 1, low: 2 } as const;
  out.sort((a, b) => {
    const p = priorityRank[a.priority] - priorityRank[b.priority];
    if (p !== 0) return p;
    return b.monthlyImpact - a.monthlyImpact;
  });

  return out;
}

// ============================================================
// UNBUDGETED-WITH-SPENDING ROWS
// Categories that have actual trailing-30 spend > threshold but no budget set.
// Rendered alongside budgeted rows in the BudgetTable so the user sees a
// complete picture of where money is going + has a one-click path to budget
// any of them.
// ============================================================
export type UnbudgetedRow = {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  groupName: string | null;
  groupSort: number | null;
  spent: number;       // trailing-30 cents (the only signal we have without a budget)
  spentMtd: number;    // calendar-MTD cents
  prevMonthSpent: number; // full prior calendar month — for MoM delta
  suggestedBudgetCents: number; // sensible default for "Set budget" button
};

const UNBUDGETED_THRESHOLD_CENTS = 2500; // $25 — below this isn't worth surfacing

export function getUnbudgetedSpendingRows(): UnbudgetedRow[] {
  const internalCats = getInternalCategoryIds();
  const excludedAccounts = getExcludedAccountIds();
  const hiddenNames = getHiddenCategoryNames();
  const today = new Date();
  const t30 = new Date(today);
  t30.setDate(t30.getDate() - 30);
  const t30Str = t30.toISOString().split("T")[0];
  const todayStr = today.toISOString().split("T")[0];
  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;

  // All trailing-30 spend grouped by category
  const t30Rows = db
    .select({
      categoryId: schema.transactions.categoryId,
      total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)`,
    })
    .from(schema.transactions)
    .where(and(
      eq(schema.transactions.type, "expense"),
      gte(schema.transactions.date, t30Str),
      lte(schema.transactions.date, todayStr),
      internalCats.length > 0 ? notInArray(schema.transactions.categoryId, internalCats) : undefined,
      excludedAccounts.length > 0 ? notInArray(schema.transactions.accountId, excludedAccounts) : undefined,
    ))
    .groupBy(schema.transactions.categoryId)
    .all();

  // Same query, calendar-MTD scope
  const mtdRows = db
    .select({
      categoryId: schema.transactions.categoryId,
      total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)`,
    })
    .from(schema.transactions)
    .where(and(
      eq(schema.transactions.type, "expense"),
      gte(schema.transactions.date, monthStart),
      lte(schema.transactions.date, todayStr),
      internalCats.length > 0 ? notInArray(schema.transactions.categoryId, internalCats) : undefined,
      excludedAccounts.length > 0 ? notInArray(schema.transactions.accountId, excludedAccounts) : undefined,
    ))
    .groupBy(schema.transactions.categoryId)
    .all();
  const mtdMap = new Map(mtdRows.map((r) => [r.categoryId, r.total]));

  // Previous calendar month (full) — drives the MoM delta on unbudgeted rows.
  const prevMonthDate = new Date(monthStart + "T00:00:00");
  prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
  const prevMonthStartU = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}-01`;
  const prevMonthEndU = getMonthEnd(prevMonthStartU);
  const prevMonthRows = db
    .select({
      categoryId: schema.transactions.categoryId,
      total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)`,
    })
    .from(schema.transactions)
    .where(and(
      eq(schema.transactions.type, "expense"),
      gte(schema.transactions.date, prevMonthStartU),
      lte(schema.transactions.date, prevMonthEndU),
      internalCats.length > 0 ? notInArray(schema.transactions.categoryId, internalCats) : undefined,
      excludedAccounts.length > 0 ? notInArray(schema.transactions.accountId, excludedAccounts) : undefined,
    ))
    .groupBy(schema.transactions.categoryId)
    .all();
  const prevMonthMap = new Map(prevMonthRows.map((r) => [r.categoryId, r.total]));

  // Existing budgets — any category with one is excluded from this list
  const budgetCategoryIds = new Set(
    db.select({ categoryId: schema.budgets.categoryId }).from(schema.budgets).all().map((b) => b.categoryId),
  );

  // Resolve category metadata
  const categories = db
    .select({
      id: schema.categories.id,
      name: schema.categories.name,
      color: schema.categories.color,
      groupName: schema.categoryGroups.name,
      groupSort: schema.categoryGroups.sortOrder,
    })
    .from(schema.categories)
    .leftJoin(schema.categoryGroups, eq(schema.categories.groupId, schema.categoryGroups.id))
    .all();
  const catMap = new Map(categories.map((c) => [c.id, c]));

  const out: UnbudgetedRow[] = [];
  for (const row of t30Rows) {
    if (!row.categoryId) continue;
    if (budgetCategoryIds.has(row.categoryId)) continue;
    if (row.total < UNBUDGETED_THRESHOLD_CENTS) continue;
    const cat = catMap.get(row.categoryId);
    if (!cat) continue;
    if (cat.groupName === "Internal" || cat.groupName === "Income") continue;
    if (cat.name && hiddenNames.has(cat.name)) continue;

    // Suggested default budget — for discretionary categories, use the cut
    // factor; for everything else, default to 80% of current spend (light trim)
    // or 100% if it's essential/committed.
    const cutRule = CUT_RULES[cat.name ?? ""];
    const bucketKey = CATEGORY_BUCKETS[cat.name ?? ""];
    let suggestedBudgetCents: number;
    if (cutRule) {
      suggestedBudgetCents = Math.round(row.total * cutRule.factor);
    } else if (bucketKey === "essential" || bucketKey === "committed") {
      suggestedBudgetCents = row.total; // these are real obligations
    } else {
      suggestedBudgetCents = Math.round(row.total * 0.9); // light trim
    }

    out.push({
      categoryId: row.categoryId,
      categoryName: cat.name ?? "Unknown",
      categoryColor: cat.color ?? "#6b7280",
      groupName: cat.groupName,
      groupSort: cat.groupSort,
      spent: row.total,
      spentMtd: mtdMap.get(row.categoryId) ?? 0,
      prevMonthSpent: prevMonthMap.get(row.categoryId) ?? 0,
      suggestedBudgetCents,
    });
  }

  return out.sort((a, b) => b.spent - a.spent);
}

export type StaleBudget = {
  budgetId: string;
  categoryId: string;
  categoryName: string;
  budgetCents: number;
  trailing30Cents: number;
  reason: "no_active_recurring" | "no_recent_spend";
  // Suggested action: drop budget to current trailing-30 (or zero it out if
  // there's no spend at all). Lets the banner offer a one-tap fix.
  suggestedBudgetCents: number;
};

/** Detect budgets that no longer reflect reality — categories where:
 *  - No active recurring rows point to the category, AND
 *  - Trailing-30 spend is < 20% of the budget (or zero)
 *
 *  Classic case: cancelled Geico left a $501 Auto Insurance budget that
 *  inflated the variable-rate cap for a month. Surfacing these prevents stale
 *  budgets from quietly skewing the cash-flow forecast.
 *
 *  Excludes "Savings" by name — it's a target, not an expense category, and
 *  trailing-30 zero is the expected steady state. */
export function getStaleBudgets(): StaleBudget[] {
  const today = new Date();
  const t30 = new Date(today);
  t30.setDate(t30.getDate() - 30);
  const t30Str = t30.toISOString().split("T")[0];
  const todayStr = today.toISOString().split("T")[0];

  const internalCats = getInternalCategoryIds();
  const excludedAccounts = getExcludedAccountIds();

  const budgets = db
    .select({
      budgetId: schema.budgets.id,
      categoryId: schema.budgets.categoryId,
      amount: schema.budgets.amount,
      categoryName: schema.categories.name,
    })
    .from(schema.budgets)
    .leftJoin(schema.categories, eq(schema.budgets.categoryId, schema.categories.id))
    .all();

  const activeRecurringCats = new Set(
    db
      .select({ categoryId: schema.recurringTransactions.categoryId })
      .from(schema.recurringTransactions)
      .where(eq(schema.recurringTransactions.isActive, true))
      .all()
      .map((r) => r.categoryId)
      .filter((id): id is string => id !== null),
  );

  const trailingRows = db
    .select({
      categoryId: schema.transactions.categoryId,
      total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)`,
    })
    .from(schema.transactions)
    .where(and(
      eq(schema.transactions.type, "expense"),
      gte(schema.transactions.date, t30Str),
      lte(schema.transactions.date, todayStr),
      internalCats.length > 0 ? notInArray(schema.transactions.categoryId, internalCats) : undefined,
      excludedAccounts.length > 0 ? notInArray(schema.transactions.accountId, excludedAccounts) : undefined,
    ))
    .groupBy(schema.transactions.categoryId)
    .all();
  const trailingMap = new Map(trailingRows.map((r) => [r.categoryId, r.total]));

  const stale: StaleBudget[] = [];
  for (const b of budgets) {
    if (!b.categoryId) continue;
    if (b.categoryName === "Savings") continue; // target, not expense

    const trailing30 = trailingMap.get(b.categoryId) ?? 0;
    const hasActiveRecurring = activeRecurringCats.has(b.categoryId);
    if (hasActiveRecurring) continue; // active scheduled spend means budget is live

    const spendRatio = b.amount > 0 ? trailing30 / b.amount : 0;
    if (spendRatio >= 0.2) continue; // real spend exists, not stale

    const reason: StaleBudget["reason"] = trailing30 === 0 ? "no_recent_spend" : "no_active_recurring";
    stale.push({
      budgetId: b.budgetId,
      categoryId: b.categoryId,
      categoryName: b.categoryName ?? "Unknown",
      budgetCents: b.amount,
      trailing30Cents: trailing30,
      reason,
      suggestedBudgetCents: trailing30, // either zero or the small actual spend
    });
  }

  return stale.sort((a, b) => b.budgetCents - a.budgetCents);
}

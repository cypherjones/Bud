import { cache } from "react";
import { db, schema } from "@/lib/db";
import { eq, and, gte, lte, desc, sql, notInArray } from "drizzle-orm";
import { getInternalCategoryIds, getExcludedAccountIds } from "./dashboard";
import { normalizeMerchantKey, cleanMerchantDisplay } from "@/lib/utils/merchant";
import { inferMonthlyCost, type Charge } from "@/lib/utils/cadence";

function getMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function getToday(): string {
  return new Date().toLocaleDateString("en-CA");
}

function getDaysInMonth(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function getDaysElapsed(): number {
  return new Date().getDate();
}

// === SPENDING BY DAY ===

export const getSpendingByDay = cache(_getSpendingByDay);
function _getSpendingByDay(startDate: string, endDate: string) {
  const internalCats = getInternalCategoryIds();
  const excludedAccounts = getExcludedAccountIds();

  return db
    .select({
      date: schema.transactions.date,
      expenses: sql<number>`COALESCE(SUM(CASE WHEN ${schema.transactions.type} = 'expense' THEN ${schema.transactions.amount} ELSE 0 END), 0)`,
      income: sql<number>`COALESCE(SUM(CASE WHEN ${schema.transactions.type} = 'income' THEN ${schema.transactions.amount} ELSE 0 END), 0)`,
    })
    .from(schema.transactions)
    .where(and(
      gte(schema.transactions.date, startDate),
      lte(schema.transactions.date, endDate),
      internalCats.length > 0 ? notInArray(schema.transactions.categoryId, internalCats) : undefined,
      excludedAccounts.length > 0 ? notInArray(schema.transactions.accountId, excludedAccounts) : undefined,
    ))
    .groupBy(schema.transactions.date)
    .orderBy(schema.transactions.date)
    .all();
}

// === SPENDING VELOCITY ===

/**
 * Daily-rate basis switches based on how much of the current month has elapsed.
 * Early in a month, two days of bills + one $1,700 outlier produce a wildly
 * inflated MTD daily rate (and a $40k+ projection). The trailing-30-day rate
 * smooths past the noise until MTD is meaningful.
 */
const MIN_MTD_DAYS_FOR_PROJECTION = 5;

export const getSpendingVelocity = cache(_getSpendingVelocity);
function _getSpendingVelocity() {
  const monthStart = getMonthStart();
  const today = getToday();
  // daysElapsed = day-of-month - 1, with a floor of 1. On day 5 at any time of
  // day, only 4 full days of spending have actually accrued — counting today
  // as a full day understates the daily rate by ~1/N (10% on day 10, etc.).
  // The floor of 1 prevents division by zero on the 1st of the month.
  const daysElapsed = Math.max(1, getDaysElapsed() - 1);
  const daysInMonth = getDaysInMonth();
  const daysRemaining = daysInMonth - daysElapsed;

  const internalCats = getInternalCategoryIds();
  const excludedAccounts = getExcludedAccountIds();

  const baseFilters = (start: string) => and(
    eq(schema.transactions.type, "expense"),
    gte(schema.transactions.date, start),
    internalCats.length > 0 ? notInArray(schema.transactions.categoryId, internalCats) : undefined,
    excludedAccounts.length > 0 ? notInArray(schema.transactions.accountId, excludedAccounts) : undefined,
  );

  // Month-to-date total — drives the headline "spent this month" number.
  const mtdSpending = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)` })
    .from(schema.transactions)
    .where(baseFilters(monthStart))
    .get();
  const totalSpent = mtdSpending?.total ?? 0;

  // Trailing 30 days — used to compute the daily rate when the current month
  // doesn't have enough days yet to be statistically meaningful.
  const t30Start = new Date();
  t30Start.setDate(t30Start.getDate() - 30);
  const t30StartStr = t30Start.toISOString().split("T")[0];
  const t30Spending = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)` })
    .from(schema.transactions)
    .where(and(
      baseFilters(t30StartStr),
      lte(schema.transactions.date, today),
    ))
    .get();
  const trailing30Total = t30Spending?.total ?? 0;

  const useMTD = daysElapsed >= MIN_MTD_DAYS_FOR_PROJECTION;
  const dailyRate = useMTD
    ? (daysElapsed > 0 ? Math.round(totalSpent / daysElapsed) : 0)
    : Math.round(trailing30Total / 30);
  const rateBasis: "mtd" | "trailing_30d" = useMTD ? "mtd" : "trailing_30d";

  // Don't extrapolate to a full-month projection until MTD is meaningful;
  // a 2-day sample with one outlier blows the projection up to nonsense.
  const projectedMonthTotal = useMTD ? dailyRate * daysInMonth : null;

  const budgets = db.select({ total: sql<number>`COALESCE(SUM(${schema.budgets.amount}), 0)` }).from(schema.budgets).get();
  const totalBudget = budgets?.total ?? 0;

  return {
    totalSpent,
    dailyRate,
    projectedMonthTotal,
    daysElapsed,
    daysRemaining,
    daysInMonth,
    totalBudget,
    rateBasis,
    onTrack: totalBudget > 0 && projectedMonthTotal !== null ? projectedMonthTotal <= totalBudget : null,
  };
}

// === MONTHLY SUMMARY ===

export const getMonthlySummary = cache(_getMonthlySummary);
function _getMonthlySummary(monthStart?: string) {
  const start = monthStart ?? getMonthStart();
  const d = new Date(start);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0];

  const internalCats = getInternalCategoryIds();
  const excludedAccounts = getExcludedAccountIds();

  const baseFilters = and(
    gte(schema.transactions.date, start),
    lte(schema.transactions.date, end),
    internalCats.length > 0 ? notInArray(schema.transactions.categoryId, internalCats) : undefined,
    excludedAccounts.length > 0 ? notInArray(schema.transactions.accountId, excludedAccounts) : undefined,
  );

  const totals = db
    .select({
      type: schema.transactions.type,
      total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)`,
    })
    .from(schema.transactions)
    .where(baseFilters)
    .groupBy(schema.transactions.type)
    .all();

  const expenses = totals.find((t) => t.type === "expense")?.total ?? 0;
  const income = totals.find((t) => t.type === "income")?.total ?? 0;
  const savingsRate = income > 0 ? Math.round(((income - expenses) / income) * 100) : 0;

  // Top categories. Group by id (not name) so distinct categories with the
  // same display name don't collapse into one row with non-deterministic
  // color. Name + color come from a single join row, so they're consistent.
  const topCategories = db
    .select({
      name: schema.categories.name,
      color: schema.categories.color,
      total: sql<number>`SUM(${schema.transactions.amount})`,
      count: sql<number>`COUNT(*)`,
    })
    .from(schema.transactions)
    .leftJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
    .where(and(eq(schema.transactions.type, "expense"), baseFilters))
    .groupBy(schema.categories.id)
    .orderBy(desc(sql`SUM(${schema.transactions.amount})`))
    .limit(8)
    .all();

  // Top merchants — pull raw rows then dedupe by normalized merchant key.
  // SQL GROUP BY on the raw description duplicates the same merchant under
  // many different bank-formatted strings (e.g. "DIGITAL CARD PURCHASE -
  // CHIPOTLE 1234 GA US" and "TST CHIPOTLE 5678" both end up as separate
  // rows). The normalizer collapses them.
  const rawMerchantRows = db
    .select({
      merchant: schema.transactions.merchant,
      amount: schema.transactions.amount,
    })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.type, "expense"), baseFilters))
    .all();

  const merchantMap = new Map<string, { merchant: string; total: number; count: number }>();
  for (const row of rawMerchantRows) {
    const raw = row.merchant ?? "Unknown";
    const key = normalizeMerchantKey(raw) || "Unknown";
    const display = cleanMerchantDisplay(raw);
    const existing = merchantMap.get(key);
    if (existing) {
      existing.total += row.amount;
      existing.count += 1;
      // Prefer the shorter, cleaner display name.
      if (display.length > 0 && display.length < existing.merchant.length) {
        existing.merchant = display;
      }
    } else {
      merchantMap.set(key, { merchant: display || raw, total: row.amount, count: 1 });
    }
  }
  const topMerchants = [...merchantMap.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  // Prior-month MoM comparison — cap at the same day-of-month as today, so
  // an MTD reading on May 4 compares against April 1-4, not all of April.
  // The old "full prior month" comparison made MTD reads always look like
  // dramatic drops (~-85% on day 4) which is just calendar bias, not a trend.
  const today = new Date();
  const isCurrentMonth =
    d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
  const prevMonthDate = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const prevStart = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}-01`;
  // When we're viewing the current month, mirror today's day-of-month; otherwise
  // (we're viewing a prior fallback month), use the full prior-prior month.
  const prevEndDateObj = isCurrentMonth
    ? new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), today.getDate())
    : new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0);
  const prevEnd = prevEndDateObj.toISOString().split("T")[0];

  const prevTotals = db
    .select({
      type: schema.transactions.type,
      total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)`,
    })
    .from(schema.transactions)
    .where(and(
      gte(schema.transactions.date, prevStart),
      lte(schema.transactions.date, prevEnd),
      internalCats.length > 0 ? notInArray(schema.transactions.categoryId, internalCats) : undefined,
      excludedAccounts.length > 0 ? notInArray(schema.transactions.accountId, excludedAccounts) : undefined,
    ))
    .groupBy(schema.transactions.type)
    .all();
  const prevExpenses = prevTotals.find((t) => t.type === "expense")?.total ?? 0;
  const prevIncome = prevTotals.find((t) => t.type === "income")?.total ?? 0;

  return {
    expenses,
    income,
    prevExpenses,
    prevIncome,
    isPartialMonth: isCurrentMonth,
    savingsRate,
    topCategories,
    topMerchants,
  };
}

// Merchant normalizers live in @/lib/utils/merchant — shared with dashboard.ts.

// === SUBSCRIPTION AUDIT ===

// Category groups whose recurring rows are NOT subscriptions for the audit's
// purposes. Rent, utilities, insurance, debt payments, transfers, and income
// are all "recurring" but they're not the cuttable SaaS/streaming/software
// burn this report is meant to surface. Filtering by group means a user can
// keep tagging everything #recurring for the schedule view without
// polluting this audit.
const NON_SUBSCRIPTION_GROUPS = new Set(["Housing", "Financial", "Internal", "Income"]);

export const getSubscriptionAudit = cache(_getSubscriptionAudit);
function _getSubscriptionAudit() {
  // Candidates are the last 120 days of charges in the Subscriptions &
  // Software group. (This used to read transactions tagged #recurring, a
  // tag last applied in April 2026 — so every row aged past the 60-day
  // staleness cutoff and the audit, and the kill list with it, went empty.)
  const since = new Date();
  since.setDate(since.getDate() - 120);
  const sinceStr = since.toISOString().split("T")[0];
  const excludedAccounts = getExcludedAccountIds();
  const recurring = db
    .select({
      id: schema.transactions.id,
      merchant: schema.transactions.merchant,
      amount: schema.transactions.amount,
      date: schema.transactions.date,
      categoryName: schema.categories.name,
      groupName: schema.categoryGroups.name,
    })
    .from(schema.transactions)
    .leftJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
    .leftJoin(schema.categoryGroups, eq(schema.categories.groupId, schema.categoryGroups.id))
    .where(and(
      eq(schema.transactions.type, "expense"),
      gte(schema.transactions.date, sinceStr),
      eq(schema.categoryGroups.name, "Subscriptions & Software"),
      excludedAccounts.length > 0 ? notInArray(schema.transactions.accountId, excludedAccounts) : undefined,
    ))
    .orderBy(desc(schema.transactions.amount))
    .all();

  // Check which ones are also tagged #cancel
  const cancelTagged = db
    .select({ transactionId: schema.transactionTags.transactionId })
    .from(schema.transactionTags)
    .innerJoin(schema.tags, eq(schema.transactionTags.tagId, schema.tags.id))
    .where(eq(schema.tags.name, "cancel"))
    .all();
  const cancelIds = new Set(cancelTagged.map((r) => r.transactionId));

  // Reimbursable subs (e.g. employer reimburses, work-paid SaaS) — should
  // not count against the "cuttable burn" headline. Tracked separately so
  // the user can still see them and confirm reimbursement is happening.
  const reimbursableTagged = db
    .select({ transactionId: schema.transactionTags.transactionId })
    .from(schema.transactionTags)
    .innerJoin(schema.tags, eq(schema.transactionTags.tagId, schema.tags.id))
    .where(eq(schema.tags.name, "reimbursable"))
    .all();
  const reimbursableIds = new Set(reimbursableTagged.map((r) => r.transactionId));

  // Kill-list: subs the user has decided to cancel but hasn't pulled the
  // trigger on yet. Surfaced as a checklist on the dashboard so they don't
  // get lost. Distinct from #cancel which means "already done."
  const killListTagged = db
    .select({ transactionId: schema.transactionTags.transactionId })
    .from(schema.transactionTags)
    .innerJoin(schema.tags, eq(schema.transactionTags.tagId, schema.tags.id))
    .where(eq(schema.tags.name, "kill-list"))
    .all();
  const killListIds = new Set(killListTagged.map((r) => r.transactionId));

  // Merchant normalizers live in @/lib/utils/merchant (shared with dashboard).
  // Alias to the names used below to minimize diff.
  const normalizeMerchant = normalizeMerchantKey;
  const cleanDisplayName = cleanMerchantDisplay;

  // Same rows, keyed for the tag-flag passes below.
  const recurringTxIds = recurring.map((r) => ({ transactionId: r.id, merchant: r.merchant }));

  // Group charges by normalized merchant, then call inferMonthlyCost (in
  // @/lib/utils/cadence) to derive a cadence-aware monthly figure. Replaces
  // the old max(amount) heuristic that overcounted variable-amount merchants
  // (Amazon's $300 max masquerading as a monthly sub cost) and miscounted
  // yearly/weekly cadences (annual domain → looked like $12/mo instead of $1).
  const chargesPerMerchant = new Map<string, {
    displayName: string;
    charges: (Charge & { categoryName: string | null })[];
  }>();

  for (const tx of recurring) {
    const raw = tx.merchant ?? "Unknown";
    if (/withdrawal to|deposit from|transfer|round up|moved to chime|mypay repay|mypay instant|apple cash sent/i.test(raw)) continue;
    if (tx.groupName && NON_SUBSCRIPTION_GROUPS.has(tx.groupName)) continue;
    const key = normalizeMerchant(raw);
    if (!key || key.length < 2) continue;
    const display = cleanDisplayName(raw);

    const existing = chargesPerMerchant.get(key);
    if (!existing) {
      chargesPerMerchant.set(key, { displayName: display || raw, charges: [] });
    } else if (display.length > 0 && display.length < existing.displayName.length) {
      existing.displayName = display;
    }
    chargesPerMerchant.get(key)!.charges.push({
      date: tx.date,
      amount: tx.amount,
      categoryName: tx.categoryName,
    });
  }

  const byMerchant = new Map<string, { merchant: string; monthlyCost: number; category: string | null; lastSeen: string; flaggedCancel: boolean; flaggedReimbursable: boolean; flaggedKillList: boolean }>();

  for (const [key, { displayName, charges }] of chargesPerMerchant) {
    const inferred = inferMonthlyCost(charges);
    // Latest charge's category — newer takes precedence if recategorized.
    const sortedByDate = [...charges].sort((a, b) => a.date.localeCompare(b.date));
    const last = sortedByDate[sortedByDate.length - 1];
    byMerchant.set(key, {
      merchant: displayName,
      monthlyCost: inferred.monthlyCost,
      category: last.categoryName,
      lastSeen: inferred.lastSeen,
      flaggedCancel: false,
      flaggedReimbursable: false,
      flaggedKillList: false,
    });
  }

  // Check cancel flags — if ANY transaction for a normalized merchant is cancelled, flag the whole merchant
  for (const row of recurringTxIds) {
    if (cancelIds.has(row.transactionId)) {
      const key = normalizeMerchant(row.merchant ?? "Unknown");
      const entry = byMerchant.get(key);
      if (entry) entry.flaggedCancel = true;
    }
    if (reimbursableIds.has(row.transactionId)) {
      const key = normalizeMerchant(row.merchant ?? "Unknown");
      const entry = byMerchant.get(key);
      if (entry) entry.flaggedReimbursable = true;
    }
    if (killListIds.has(row.transactionId)) {
      const key = normalizeMerchant(row.merchant ?? "Unknown");
      const entry = byMerchant.get(key);
      if (entry) entry.flaggedKillList = true;
    }
  }

  // Special case: if a merchant has transactions on multiple accounts and only one account's are cancelled,
  // don't flag the whole merchant. Check if there are non-cancelled transactions too.
  // (This handles TradingView on Chime being active while Capital One is cancelled)
  for (const [key, entry] of byMerchant) {
    if (!entry.flaggedCancel) continue;
    // Check if there are any non-cancelled recurring transactions for this merchant
    const allForMerchant = recurringTxIds.filter(r => normalizeMerchant(r.merchant ?? "") === key);
    const hasActive = allForMerchant.some(r => !cancelIds.has(r.transactionId));
    if (hasActive) entry.flaggedCancel = false;
  }

  // Staleness: a #recurring tag on a transaction lives forever, but a
  // subscription the user actually pays for hits the bank statement
  // monthly-ish. Anything not seen in 60+ days is almost certainly already
  // cancelled (or a one-off that got mis-tagged) — surface separately so
  // it doesn't bloat the active total.
  const STALE_DAYS = 60;
  const todayMs = Date.now();
  const subscriptionsRaw = [...byMerchant.values()]
    .map((s) => {
      const lastSeenMs = new Date(s.lastSeen + "T00:00:00").getTime();
      const daysSinceLastSeen = Math.max(0, Math.round((todayMs - lastSeenMs) / 86400000));
      return { ...s, daysSinceLastSeen, isStale: daysSinceLastSeen > STALE_DAYS };
    })
    .sort((a, b) => b.monthlyCost - a.monthlyCost);

  // The headline "active monthly" excludes cancelled AND stale rows. Stale
  // items still render below the active list so the user can confirm or
  // re-tag them.
  const subscriptions = subscriptionsRaw.filter((s) => !s.isStale);
  const staleSubscriptions = subscriptionsRaw.filter((s) => s.isStale && !s.flaggedCancel);
  // Active = not cancelled, not reimbursed, not stale. Reimbursable subs are
  // surfaced separately so the user can confirm reimbursement is happening
  // without inflating the "real burn" headline.
  const activeSubs = subscriptions.filter((s) => !s.flaggedCancel && !s.flaggedReimbursable);
  const reimbursableSubs = subscriptions.filter((s) => s.flaggedReimbursable && !s.flaggedCancel);
  const killListSubs = subscriptions.filter((s) => s.flaggedKillList && !s.flaggedCancel);
  const cancelledSubs = subscriptions.filter((s) => s.flaggedCancel);
  const totalMonthly = activeSubs.reduce((s, sub) => s + sub.monthlyCost, 0);
  const reimbursableMonthly = reimbursableSubs.reduce((s, sub) => s + sub.monthlyCost, 0);
  const killListMonthly = killListSubs.reduce((s, sub) => s + sub.monthlyCost, 0);
  const cancelledMonthlySavings = cancelledSubs.reduce((s, sub) => s + sub.monthlyCost, 0);
  const staleMonthly = staleSubscriptions.reduce((s, sub) => s + sub.monthlyCost, 0);

  return {
    subscriptions,
    staleSubscriptions,
    reimbursableSubs,
    killListSubs,
    totalMonthly,
    totalAnnual: totalMonthly * 12,
    reimbursableMonthly,
    killListMonthly,
    cancelledMonthlySavings,
    staleMonthly,
  };
}

// === DISCRETIONARY SPENDING (formerly "Frivolous") ===
//
// Auto-pulls from category groups + categories that are typically cuttable
// — Personal (Entertainment, Vape, Adult Content, Other), Food & Drink
// (excluding Groceries which is essential), Shopping (Books, Clothing,
// Stationery). The user can also force-include any single transaction by
// tagging it #frivolous, and force-exclude with #essential.
//
// Renamed from "Frivolous" because manual tagging gave too sparse a signal
// to be useful. Auto-derivation surfaces the real money leaks regardless of
// whether the user has been tagging.

const DISCRETIONARY_CATEGORY_NAMES = new Set([
  // Food & Drink (groceries excluded). Dining + Fast Food merged into Restaurants
  // in the data layer (2026-05); kept here as no-ops in case a Teller sync ever
  // recreates them so the classifier still treats them as discretionary.
  "Restaurants",
  "Dining",
  "Fast Food",
  "Coffee & Cafes",
  // Personal
  "Entertainment",
  "Vape & Tobacco",
  "Adult Content",
  "Peer-to-Peer",
  // "Other" intentionally excluded — it's the auto-categorization gap bucket
  // (Gusto, tolls, debt payments, etc.) and inflates the discretionary headline
  // by ~$2.4k/mo of misclassified items. Surfaced separately via the
  // otherCategoryItems drilldown for one-click recategorization. Real fix is
  // in category-map.ts.
  // Shopping (excluding gifts/stationery which can be essential)
  "Books & Education",
  "Clothing & Fashion",
  "Shopping",
]);

export const getFrivolousSpending = cache(_getFrivolousSpending);
function _getFrivolousSpending(startDate?: string) {
  const start = startDate ?? getMonthStart();
  const internalCats = getInternalCategoryIds();
  const excludedAccounts = getExcludedAccountIds();

  // Window in days from `start` through today. Drives the annual extrapolation.
  // Without this we were multiplying any partial-month total by 12, which on
  // May 4 shows ~5x the actual annualized figure.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDateObj = new Date(start + "T00:00:00");
  const daysInWindow = Math.max(
    1,
    Math.round((today.getTime() - startDateObj.getTime()) / 86400000) + 1,
  );

  // Auto-derive: every transaction in a discretionary category over the
  // window. Force-include via #frivolous tag, force-exclude via #essential.
  const frivolousTagged = db
    .select({ transactionId: schema.transactionTags.transactionId })
    .from(schema.transactionTags)
    .innerJoin(schema.tags, eq(schema.transactionTags.tagId, schema.tags.id))
    .where(eq(schema.tags.name, "frivolous"))
    .all();
  const essentialTagged = db
    .select({ transactionId: schema.transactionTags.transactionId })
    .from(schema.transactionTags)
    .innerJoin(schema.tags, eq(schema.transactionTags.tagId, schema.tags.id))
    .where(eq(schema.tags.name, "essential"))
    .all();
  const forceIncludeIds = new Set(frivolousTagged.map((r) => r.transactionId));
  const forceExcludeIds = new Set(essentialTagged.map((r) => r.transactionId));

  // Pull all expenses in the window with category info — we'll filter in JS
  // since the auto-include set is "category in DISCRETIONARY_CATEGORY_NAMES
  // OR id in forceIncludeIds." A pure SQL filter would either over-fetch or
  // need a complex join.
  const allExpenses = db
    .select({
      id: schema.transactions.id,
      merchant: schema.transactions.merchant,
      amount: schema.transactions.amount,
      date: schema.transactions.date,
      categoryName: schema.categories.name,
      categoryColor: schema.categories.color,
    })
    .from(schema.transactions)
    .leftJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
    .where(and(
      eq(schema.transactions.type, "expense"),
      gte(schema.transactions.date, start),
      internalCats.length > 0 ? notInArray(schema.transactions.categoryId, internalCats) : undefined,
      excludedAccounts.length > 0 ? notInArray(schema.transactions.accountId, excludedAccounts) : undefined,
    ))
    .orderBy(desc(schema.transactions.amount))
    .all();

  const frivolous = allExpenses.filter((tx) => {
    if (forceExcludeIds.has(tx.id)) return false;
    if (forceIncludeIds.has(tx.id)) return true;
    return tx.categoryName !== null && DISCRETIONARY_CATEGORY_NAMES.has(tx.categoryName);
  });

  // Total spending for percentage calc
  const totalSpending = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)` })
    .from(schema.transactions)
    .where(and(
      eq(schema.transactions.type, "expense"),
      gte(schema.transactions.date, start),
      internalCats.length > 0 ? notInArray(schema.transactions.categoryId, internalCats) : undefined,
      excludedAccounts.length > 0 ? notInArray(schema.transactions.accountId, excludedAccounts) : undefined,
    ))
    .get();

  const frivolousTotal = frivolous.reduce((s, t) => s + t.amount, 0);
  const allTotal = totalSpending?.total ?? 0;
  const percentage = allTotal > 0 ? Math.round((frivolousTotal / allTotal) * 100) : 0;

  // "Other" catch-all drill-down — last 30 days, top 20 by amount. The "Other"
  // category typically hides misclassified business / debt / tax / toll items
  // and is the single biggest leak in the discretionary report. Surfacing them
  // lets the user recategorize one-by-one rather than chasing a $2k phantom.
  const last30Date = new Date();
  last30Date.setDate(last30Date.getDate() - 30);
  const last30Str = last30Date.toISOString().split("T")[0];
  const otherCategoryItems = db
    .select({
      id: schema.transactions.id,
      merchant: schema.transactions.merchant,
      amount: schema.transactions.amount,
      date: schema.transactions.date,
      categoryId: schema.transactions.categoryId,
      categoryName: schema.categories.name,
      categoryColor: schema.categories.color,
    })
    .from(schema.transactions)
    .leftJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
    .where(and(
      eq(schema.transactions.type, "expense"),
      eq(schema.categories.name, "Other"),
      gte(schema.transactions.date, last30Str),
      excludedAccounts.length > 0 ? notInArray(schema.transactions.accountId, excludedAccounts) : undefined,
    ))
    .orderBy(desc(schema.transactions.amount))
    .limit(20)
    .all();
  const otherCategoryTotal = otherCategoryItems.reduce((s, t) => s + t.amount, 0);

  // Normalize the partial window to a per-day rate, then extrapolate.
  // For very small windows (<7 days) the run-rate is dominated by a single
  // outlier — flag as volatile and let the UI decide whether to suppress.
  const dailyRate = frivolousTotal / daysInWindow;
  const monthlyProjection = Math.round(dailyRate * 30);
  const annualProjection = Math.round(dailyRate * 365);
  const isVolatile = daysInWindow < 7;

  // Group by category for donut
  const byCategory = new Map<string, { name: string; value: number; color: string }>();
  for (const tx of frivolous) {
    const cat = tx.categoryName ?? "Other";
    if (!byCategory.has(cat)) byCategory.set(cat, { name: cat, value: 0, color: tx.categoryColor ?? "#6b7280" });
    byCategory.get(cat)!.value += tx.amount;
  }

  return {
    items: frivolous,
    total: frivolousTotal,
    percentage,
    monthlyProjection,
    annualProjection,
    daysInWindow,
    isVolatile,
    byCategory: [...byCategory.values()].sort((a, b) => b.value - a.value),
    otherCategoryItems,
    otherCategoryTotal,
  };
}

// === CATEGORY TRENDS ===

export type CategoryTrendsMonth = {
  month: string; // "May 2026"
  categories: { id: string | null; name: string; total: number; color: string }[];
  isPartial: boolean; // true when the month is the current calendar month and not yet complete
  daysCovered: number; // number of days included in this row's totals
  daysInMonth: number;
};

export const getCategoryTrends = cache(_getCategoryTrends);
function _getCategoryTrends(months: number = 3): CategoryTrendsMonth[] {
  const results: CategoryTrendsMonth[] = [];

  const internalCats = getInternalCategoryIds();
  const excludedAccounts = getExcludedAccountIds();
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  for (let i = 0; i < months; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const monthStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const monthEnd = lastDayOfMonth.toISOString().split("T")[0];
    const monthLabel = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });

    const isCurrentMonth =
      d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
    // Cap the upper bound at today for the current month so the partial-month
    // total isn't extrapolated implicitly by rendering it as a "full" month.
    const effectiveEnd = isCurrentMonth ? todayStr : monthEnd;

    const cats = db
      .select({
        id: schema.categories.id,
        name: schema.categories.name,
        color: schema.categories.color,
        total: sql<number>`SUM(${schema.transactions.amount})`,
      })
      .from(schema.transactions)
      .leftJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
      .where(and(
        eq(schema.transactions.type, "expense"),
        gte(schema.transactions.date, monthStart),
        lte(schema.transactions.date, effectiveEnd),
        internalCats.length > 0 ? notInArray(schema.transactions.categoryId, internalCats) : undefined,
        excludedAccounts.length > 0 ? notInArray(schema.transactions.accountId, excludedAccounts) : undefined,
      ))
      .groupBy(schema.categories.id)
      .orderBy(desc(sql`SUM(${schema.transactions.amount})`))
      .all();

    const daysInMonth = lastDayOfMonth.getDate();
    const daysCovered = isCurrentMonth ? today.getDate() : daysInMonth;

    results.push({
      month: monthLabel,
      categories: cats.map((c) => ({
        id: c.id ?? null,
        name: c.name ?? "Other",
        total: c.total,
        color: c.color ?? "#6b7280",
      })),
      isPartial: isCurrentMonth,
      daysCovered,
      daysInMonth,
    });
  }

  return results.reverse();
}

// === CASH FLOW FORECAST ===

/**
 * Cash-flow forecast that walks the actual schedule, not flat averages.
 *
 * Past days come from getSpendingByDay (real transactions). Future days come
 * from active recurring_transactions expanded by frequency through the
 * projection window. The projected-balance line starts at today's summed
 * non-excluded account balance and walks forward day-by-day applying
 * scheduled inflows and outflows.
 */
/**
 * Computes a "survival floor" — the minimum balance the user can carry
 * before missing a debt minimum or housing bill. Any projected dip below
 * this is a real cash crunch (vs the old arbitrary 50%-of-starting threshold).
 */
function getSurvivalFloor(): number {
  // Sum of active debt minimums (real obligations that bounce if missed).
  const activeDebts = db
    .select({ minimumPayment: schema.debts.minimumPayment })
    .from(schema.debts)
    .where(eq(schema.debts.status, "active"))
    .all();
  const debtMinsCents = activeDebts.reduce((s, d) => s + d.minimumPayment, 0);

  // Sum of monthly recurring outflows in the Housing category group — rent /
  // utilities. Anything else (subscriptions, etc.) is technically cancellable
  // under stress, so we don't include it in the floor.
  const housing = db
    .select({
      amount: schema.recurringTransactions.amount,
      frequency: schema.recurringTransactions.frequency,
      groupName: schema.categoryGroups.name,
    })
    .from(schema.recurringTransactions)
    .leftJoin(schema.categories, eq(schema.recurringTransactions.categoryId, schema.categories.id))
    .leftJoin(schema.categoryGroups, eq(schema.categories.groupId, schema.categoryGroups.id))
    .where(eq(schema.recurringTransactions.isActive, true))
    .all();
  let housingMonthly = 0;
  for (const r of housing) {
    if (r.groupName !== "Housing") continue;
    switch (r.frequency) {
      case "monthly":
        housingMonthly += r.amount;
        break;
      case "biweekly":
        housingMonthly += r.amount * 2;
        break;
      case "weekly":
        housingMonthly += r.amount * 4;
        break;
      // yearly omitted — too lumpy to fold into a monthly floor.
    }
  }

  return debtMinsCents + housingMonthly;
}

/**
 * Estimate the daily VARIABLE-expense spend rate for the cash-flow projection.
 *
 * Sums trailing-30 spend in every expense category that is NOT covered by an
 * active recurring row, then caps each category's contribution at its monthly
 * budget when one is set. The cash-flow forecast schedules recurring outflows
 * directly (rent / debt / subs / utilities), so this rate carries everything
 * else: groceries, gas, health, car care, restaurants, ad-hoc debt payments,
 * late fees, etc.
 *
 * Previously this only counted ~9 "discretionary" categories (Restaurants,
 * Coffee, Vape, etc.) and silently dropped real recurring-but-not-scheduled
 * spend like Groceries (~$760/mo) and Health (~$500/mo), inflating the
 * projected net by $2k+/mo.
 *
 * The cap at budget keeps committed spend honest — if the user budgets $450
 * for Restaurants but trailing-30 was $1000, the rate uses $450. If trailing
 * is below budget, trailing wins (don't fabricate burn).
 */
type CategoryBudgetCap = { categoryName: string; trailing30: number; budget: number | null; effective: number };

function getVariableExpenseRateBreakdown(): { dailyRate: number; rows: CategoryBudgetCap[] } {
  const internalCats = new Set(getInternalCategoryIds());
  const excludedAccounts = new Set(getExcludedAccountIds());
  const today = new Date();
  const t30Start = new Date(today);
  t30Start.setDate(t30Start.getDate() - 30);
  const t30StartStr = t30Start.toISOString().split("T")[0];
  const todayStr = today.toISOString().split("T")[0];

  // Categories already covered by active recurring rows — exclude from rate
  // to avoid double-counting (recurring expansion schedules them directly).
  const recurringCategoryRows = db
    .select({ categoryId: schema.recurringTransactions.categoryId })
    .from(schema.recurringTransactions)
    .where(eq(schema.recurringTransactions.isActive, true))
    .all();
  const recurringCovered = new Set(
    recurringCategoryRows.map((r) => r.categoryId).filter((id): id is string => id !== null),
  );

  // Trailing-30 spend grouped by category.
  const spendRows = db
    .select({
      categoryId: schema.transactions.categoryId,
      categoryName: schema.categories.name,
      total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)`,
    })
    .from(schema.transactions)
    .leftJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
    .where(and(
      eq(schema.transactions.type, "expense"),
      gte(schema.transactions.date, t30StartStr),
      lte(schema.transactions.date, todayStr),
      internalCats.size > 0 ? notInArray(schema.transactions.categoryId, [...internalCats]) : undefined,
      excludedAccounts.size > 0 ? notInArray(schema.transactions.accountId, [...excludedAccounts]) : undefined,
    ))
    .groupBy(schema.transactions.categoryId)
    .all();

  // Budgets keyed by category id — for capping.
  const budgetRows = db
    .select({ categoryId: schema.budgets.categoryId, amount: schema.budgets.amount })
    .from(schema.budgets)
    .all();
  const budgetByCategoryId = new Map<string, number>();
  for (const b of budgetRows) {
    if (b.categoryId) budgetByCategoryId.set(b.categoryId, b.amount);
  }

  const rows: CategoryBudgetCap[] = [];
  let variable30 = 0;
  for (const r of spendRows) {
    if (!r.categoryName) continue;
    // Drop the auto-categorization gap bucket — same reason discretionary
    // excludes it. "Other" hides Gusto / tolls / debt payments / etc. that
    // auto-cat couldn't classify; treating it as variable burn inflates the
    // daily rate by ~$80/day (~$2.4k/mo of phantom spend). Real fix lives in
    // category-map.ts; until then, don't double-charge the user for it here.
    if (r.categoryName === "Other") continue;
    // Drop categories already covered by recurring rows — those are scheduled
    // explicitly in the cash-flow projection, not part of the daily-rate burn.
    if (r.categoryId && recurringCovered.has(r.categoryId)) continue;
    const budget = r.categoryId ? budgetByCategoryId.get(r.categoryId) ?? null : null;
    // Cap monthly contribution at budget when set. Trailing-30 ≈ monthly
    // (close enough for a daily-rate estimate). When user is under budget
    // already, trailing-30 wins (don't pretend they'll spend more).
    const effective = budget !== null ? Math.min(r.total, budget) : r.total;
    variable30 += effective;
    rows.push({ categoryName: r.categoryName, trailing30: r.total, budget, effective });
  }

  return { dailyRate: Math.round(variable30 / 30), rows };
}

export const getCashFlowForecast = cache(_getCashFlowForecast);
function _getCashFlowForecast(days: number = 90) {
  const monthStart = getMonthStart();
  const today = getToday();
  const todayDate = new Date(today + "T00:00:00");

  const actuals = getSpendingByDay(monthStart, today);
  const variableBreakdown = getVariableExpenseRateBreakdown();
  const variableDailyRate = variableBreakdown.dailyRate;
  const cappedCategoryCount = variableBreakdown.rows.filter(
    (r) => r.budget !== null && r.budget < r.trailing30,
  ).length;

  // Starting balance = liquid total (depository accounts only). Credit-card
  // balances live in the debts table; including them as positive balances
  // would treat debt as cash and inflate the entire projection line.
  const excludedAccountIds = new Set(getExcludedAccountIds());
  const accounts = db.select().from(schema.accounts).all();
  const startingBalance = accounts
    .filter((a) => !excludedAccountIds.has(a.id) && a.accountType === "depository")
    .reduce((s, a) => s + (a.balance ?? 0), 0);

  // Active recurring rows with category-group context for income/expense classification.
  const internalCats = new Set(getInternalCategoryIds());
  const recurring = db
    .select({
      id: schema.recurringTransactions.id,
      merchant: schema.recurringTransactions.merchant,
      amount: schema.recurringTransactions.amount,
      frequency: schema.recurringTransactions.frequency,
      nextDueDate: schema.recurringTransactions.nextDueDate,
      categoryId: schema.recurringTransactions.categoryId,
      groupName: schema.categoryGroups.name,
    })
    .from(schema.recurringTransactions)
    .leftJoin(schema.categories, eq(schema.recurringTransactions.categoryId, schema.categories.id))
    .leftJoin(schema.categoryGroups, eq(schema.categories.groupId, schema.categoryGroups.id))
    .where(eq(schema.recurringTransactions.isActive, true))
    .all();

  // Drop Internal-group recurring (transfers, round-ups) — they're net-zero plumbing.
  const projectionRecurring = recurring.filter(
    (r) => r.groupName !== "Internal" && (r.categoryId === null || !internalCats.has(r.categoryId)),
  );

  type Day = { date: string; expenses: number; income: number; isProjected: boolean; projectedBalance: number };
  const dayMap = new Map<string, Day>();

  // Seed past actuals.
  for (const a of actuals) {
    dayMap.set(a.date, {
      date: a.date,
      expenses: a.expenses,
      income: a.income,
      isProjected: false,
      projectedBalance: 0,
    });
  }

  // Seed future days with zero buckets so every day in the window has an entry.
  const projectionEnd = new Date(todayDate);
  projectionEnd.setDate(projectionEnd.getDate() + days);
  for (let i = 1; i <= days; i++) {
    const d = new Date(todayDate);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    if (!dayMap.has(dateStr)) {
      dayMap.set(dateStr, {
        date: dateStr,
        expenses: 0,
        income: 0,
        isProjected: true,
        projectedBalance: 0,
      });
    }
  }

  // Expand each recurring row across the projection window.
  for (const r of projectionRecurring) {
    if (!r.nextDueDate) continue;
    const isIncome = r.groupName === "Income";

    const occ = new Date(r.nextDueDate + "T00:00:00");
    const guardLimit = 400; // safety against malformed frequency strings
    let iter = 0;
    while (occ <= projectionEnd && iter < guardLimit) {
      iter++;
      const dateStr = occ.toISOString().split("T")[0];
      // Skip occurrences in the past (those are in actuals or already happened).
      if (dateStr > today) {
        const day = dayMap.get(dateStr);
        if (day) {
          if (isIncome) day.income += r.amount;
          else day.expenses += r.amount;
        }
      }

      switch (r.frequency) {
        case "weekly":
          occ.setDate(occ.getDate() + 7);
          break;
        case "biweekly":
          occ.setDate(occ.getDate() + 14);
          break;
        case "monthly":
          occ.setMonth(occ.getMonth() + 1);
          break;
        case "yearly":
          occ.setFullYear(occ.getFullYear() + 1);
          break;
        default:
          occ.setTime(projectionEnd.getTime() + 86400000); // bail
      }
    }
  }

  // Walk the running balance forward through the projection window. Each
  // projected day also subtracts the daily variable-expense rate so the line
  // reflects realistic groceries/dining/gas/health burn, not just scheduled
  // bills. The rate covers every expense category not already on a recurring
  // schedule (and capped at budget where one is set).
  const sortedDays = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  let runningBalance = startingBalance;
  for (const day of sortedDays) {
    if (day.isProjected) {
      day.expenses += variableDailyRate;
      runningBalance += day.income - day.expenses;
      day.projectedBalance = runningBalance;
    }
  }

  // Headlines.
  const monthEnd = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0).toISOString().split("T")[0];
  const nextMonthEnd = new Date(todayDate.getFullYear(), todayDate.getMonth() + 2, 0).toISOString().split("T")[0];
  const eomEntry = sortedDays.find((d) => d.date === monthEnd);
  const enmEntry = sortedDays.find((d) => d.date === nextMonthEnd);
  const endOfMonthBalance = eomEntry?.projectedBalance ?? runningBalance;
  const endOfNextMonthBalance = enmEntry?.projectedBalance ?? runningBalance;

  // Lowest point in the projected window — flags upcoming cash crunches.
  const projectedDays = sortedDays.filter((d) => d.isProjected);
  let lowestProjected: { balance: number; date: string } | null = null;
  for (const d of projectedDays) {
    if (lowestProjected === null || d.projectedBalance < lowestProjected.balance) {
      lowestProjected = { balance: d.projectedBalance, date: d.date };
    }
  }

  const projectedNet30 = projectedDays.slice(0, 30).reduce((s, d) => s + d.income - d.expenses, 0);

  const survivalFloor = getSurvivalFloor();
  const breachesFloor = lowestProjected !== null && lowestProjected.balance < survivalFloor;

  return {
    data: sortedDays,
    startingBalance,
    endOfMonthBalance,
    endOfNextMonthBalance,
    lowestProjected,
    projectedNet30,
    survivalFloor,
    breachesFloor,
    variableDailyRate,
    cappedCategoryCount,
    variableBreakdown: variableBreakdown.rows,
  };
}

import { db, schema } from "@/lib/db";
import { eq, and, gte, lte, desc, sql, like, notInArray } from "drizzle-orm";
import { getInternalCategoryIds, getExcludedAccountIds } from "./dashboard";

function getMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

function getDaysInMonth(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function getDaysElapsed(): number {
  return new Date().getDate();
}

// === SPENDING BY DAY ===

export function getSpendingByDay(startDate: string, endDate: string) {
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

export function getSpendingVelocity() {
  const monthStart = getMonthStart();
  const today = getToday();
  const daysElapsed = getDaysElapsed();
  const daysInMonth = getDaysInMonth();
  const daysRemaining = daysInMonth - daysElapsed;

  const internalCats = getInternalCategoryIds();
  const excludedAccounts = getExcludedAccountIds();

  const spending = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)` })
    .from(schema.transactions)
    .where(and(
      eq(schema.transactions.type, "expense"),
      gte(schema.transactions.date, monthStart),
      internalCats.length > 0 ? notInArray(schema.transactions.categoryId, internalCats) : undefined,
      excludedAccounts.length > 0 ? notInArray(schema.transactions.accountId, excludedAccounts) : undefined,
    ))
    .get();

  const totalSpent = spending?.total ?? 0;
  const dailyRate = daysElapsed > 0 ? Math.round(totalSpent / daysElapsed) : 0;
  const projectedMonthTotal = dailyRate * daysInMonth;

  // Get total budget for comparison
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
    onTrack: totalBudget > 0 ? projectedMonthTotal <= totalBudget : null,
  };
}

// === MONTHLY SUMMARY ===

export function getMonthlySummary(monthStart?: string) {
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

  // Top categories
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
    .groupBy(schema.categories.name)
    .orderBy(desc(sql`SUM(${schema.transactions.amount})`))
    .limit(8)
    .all();

  // Top merchants
  const topMerchants = db
    .select({
      merchant: schema.transactions.merchant,
      total: sql<number>`SUM(${schema.transactions.amount})`,
      count: sql<number>`COUNT(*)`,
    })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.type, "expense"), baseFilters))
    .groupBy(schema.transactions.merchant)
    .orderBy(desc(sql`SUM(${schema.transactions.amount})`))
    .limit(8)
    .all();

  return { expenses, income, savingsRate, topCategories, topMerchants };
}

// === SUBSCRIPTION AUDIT ===

export function getSubscriptionAudit() {
  // Get transactions tagged #recurring
  const recurring = db
    .select({
      merchant: schema.transactions.merchant,
      amount: schema.transactions.amount,
      date: schema.transactions.date,
      categoryName: schema.categories.name,
    })
    .from(schema.transactionTags)
    .innerJoin(schema.tags, eq(schema.transactionTags.tagId, schema.tags.id))
    .innerJoin(schema.transactions, eq(schema.transactionTags.transactionId, schema.transactions.id))
    .leftJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
    .where(and(eq(schema.tags.name, "recurring"), eq(schema.transactions.type, "expense")))
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

  // Normalize merchant names for deduplication
  function normalizeMerchant(name: string): string {
    return name
      .toUpperCase()
      .replace(/^["']/, "") // leading quotes from CSV
      .replace(/^(DIGITAL CARD PURCHASE - |DEBIT CARD PURCHASE - |ACH WITHDRAWAL |SP |TST |SQ |DD |IC\*?\s?|HLU\s?)/, "") // prefixes
      .replace(/\*.*$/, "") // everything after * (Dropbox*xxx, Amazon Prime*xxx)
      .replace(/\s+\d{3}[\s-]?\d{3,4}[\s-]?\d{4}.*/, "") // phone numbers and everything after
      .replace(/\s+(CA|NY|TX|GA|CO|DE|OH|MA|WA|DC|US)\s*$/,"") // trailing state codes
      .replace(/\s+(CA|NY|TX|GA|CO|DE|OH|MA|WA|DC|US)\s+(U|US)?\s*"?\s*$/, "") // state + country
      .replace(/\s+\d{5,}.*/, "") // long IDs and everything after
      .replace(/\s+(SOLIDGATE|WESTERVILLE|BROOKLYN|SAN FRANCISCO|HOUSTON|ATLANTA|CUPERTINO|HULU COM BIL|WASHINGTON).*/, "") // location suffixes
      .replace(/\s+(INC\.?|LLC|COM|SUBSCR|DIR DEP|BILL PAYMENT|DT RETAIL|PURCHASE\s*\w*|DEBITS|DEBIT|PAYMENT|RETRY PYMT|AUTO|LABS|SYSTEMS|LIMITED|CHATGPT)(\s.*)?$/, "") // business suffixes
      .replace(/\s+(159|161)\s.*/, "") // Instacart store numbers
      .replace(/\s+[A-Z0-9]{8,}.*/, "") // long alphanumeric codes
      .replace(/\s+/g, " ")
      .replace(/\b(\w+)\s+\1\b/gi, "$1") // collapse repeated words
      .replace(/^HULUPLUS.*/, "HULU") // normalize all Hulu variants
      .replace(/\s+$/, "")
      .trim();
  }

  // Clean display name
  function cleanDisplayName(name: string): string {
    return name
      .replace(/^(Digital Card Purchase - |Debit Card Purchase - |ACH Withdrawal |SP |TST |SQ |DD |IC\*?\s?|HLU\s?)/i, "")
      .replace(/\s+\d{3}[\s-]?\d{3,4}[\s-]?\d{4}.*/,"")
      .replace(/\s+\d{5,}.*/, "")
      .replace(/\s+[A-Z0-9]{8,}.*/, "")
      .replace(/\*.*$/, "")
      .replace(/\s+(CA|NY|TX|GA|CO|DE|OH|MA|WA|DC)\s*(U|US)?\s*"?\s*$/, "")
      .replace(/^["']|["']$/g, "")
      .trim();
  }

  // Filter out internal/transfer categories from subscription list
  const internalIds = getInternalCategoryIds();

  // Get all recurring transaction IDs with cancel status
  const recurringTxIds = db
    .select({ transactionId: schema.transactionTags.transactionId, merchant: schema.transactions.merchant })
    .from(schema.transactionTags)
    .innerJoin(schema.tags, eq(schema.transactionTags.tagId, schema.tags.id))
    .innerJoin(schema.transactions, eq(schema.transactionTags.transactionId, schema.transactions.id))
    .where(eq(schema.tags.name, "recurring"))
    .all();

  // Group by normalized merchant, take highest amount as monthly cost
  const byMerchant = new Map<string, { merchant: string; monthlyCost: number; category: string | null; lastSeen: string; flaggedCancel: boolean }>();

  for (const tx of recurring) {
    const raw = tx.merchant ?? "Unknown";
    // Skip internal transfers
    if (/withdrawal to|deposit from|transfer|round up|moved to chime|mypay repay|mypay instant|apple cash sent/i.test(raw)) continue;
    const key = normalizeMerchant(raw);
    if (!key || key.length < 2) continue;
    const existing = byMerchant.get(key);
    const display = cleanDisplayName(raw);
    if (!existing || tx.amount > existing.monthlyCost) {
      byMerchant.set(key, {
        merchant: existing ? (display.length < existing.merchant.length ? display : existing.merchant) : display,
        monthlyCost: tx.amount,
        category: tx.categoryName,
        lastSeen: tx.date,
        flaggedCancel: false,
      });
    } else if (display.length < existing.merchant.length) {
      existing.merchant = display;
    }
  }

  // Check cancel flags — if ANY transaction for a normalized merchant is cancelled, flag the whole merchant
  for (const row of recurringTxIds) {
    if (cancelIds.has(row.transactionId)) {
      const key = normalizeMerchant(row.merchant ?? "Unknown");
      const entry = byMerchant.get(key);
      if (entry) entry.flaggedCancel = true;
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

  const subscriptions = [...byMerchant.values()].sort((a, b) => b.monthlyCost - a.monthlyCost);

  // The roll-up represents *current* monthly burn — exclude anything flagged
  // as cancelled. Cancelled subs still appear in the list (with the flag) so
  // the user can see what they used to be paying, but the headline number is
  // the cost of what's still active.
  const activeSubs = subscriptions.filter((s) => !s.flaggedCancel);
  const cancelledSubs = subscriptions.filter((s) => s.flaggedCancel);
  const totalMonthly = activeSubs.reduce((s, sub) => s + sub.monthlyCost, 0);
  const cancelledMonthlySavings = cancelledSubs.reduce((s, sub) => s + sub.monthlyCost, 0);

  return {
    subscriptions,
    totalMonthly,
    totalAnnual: totalMonthly * 12,
    cancelledMonthlySavings,
  };
}

// === TAX DEDUCTIONS ===

export function getTaxDeductions(year?: number) {
  const yearStart = `${year ?? new Date().getFullYear()}-01-01`;
  const yearEnd = `${year ?? new Date().getFullYear()}-12-31`;

  const deductions = db
    .select({
      id: schema.transactions.id,
      merchant: schema.transactions.merchant,
      description: schema.transactions.description,
      amount: schema.transactions.amount,
      date: schema.transactions.date,
      categoryName: schema.categories.name,
    })
    .from(schema.transactionTags)
    .innerJoin(schema.tags, eq(schema.transactionTags.tagId, schema.tags.id))
    .innerJoin(schema.transactions, eq(schema.transactionTags.transactionId, schema.transactions.id))
    .leftJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
    .where(and(
      eq(schema.tags.name, "tax-deductible"),
      eq(schema.transactions.type, "expense"),
      gte(schema.transactions.date, yearStart),
      lte(schema.transactions.date, yearEnd),
    ))
    .orderBy(desc(schema.transactions.amount))
    .all();

  // Group by category
  const byCategory = new Map<string, { category: string; items: typeof deductions; total: number }>();
  for (const tx of deductions) {
    const cat = tx.categoryName ?? "Other";
    if (!byCategory.has(cat)) byCategory.set(cat, { category: cat, items: [], total: 0 });
    const entry = byCategory.get(cat)!;
    entry.items.push(tx);
    entry.total += tx.amount;
  }

  const groups = [...byCategory.values()].sort((a, b) => b.total - a.total);
  const total = deductions.reduce((s, d) => s + d.amount, 0);

  return { groups, total, count: deductions.length };
}

// === FRIVOLOUS SPENDING ===

export function getFrivolousSpending(startDate?: string) {
  const start = startDate ?? getMonthStart();
  const internalCats = getInternalCategoryIds();
  const excludedAccounts = getExcludedAccountIds();

  const frivolous = db
    .select({
      id: schema.transactions.id,
      merchant: schema.transactions.merchant,
      amount: schema.transactions.amount,
      date: schema.transactions.date,
      categoryName: schema.categories.name,
      categoryColor: schema.categories.color,
    })
    .from(schema.transactionTags)
    .innerJoin(schema.tags, eq(schema.transactionTags.tagId, schema.tags.id))
    .innerJoin(schema.transactions, eq(schema.transactionTags.transactionId, schema.transactions.id))
    .leftJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
    .where(and(
      eq(schema.tags.name, "frivolous"),
      eq(schema.transactions.type, "expense"),
      gte(schema.transactions.date, start),
      excludedAccounts.length > 0 ? notInArray(schema.transactions.accountId, excludedAccounts) : undefined,
    ))
    .orderBy(desc(schema.transactions.amount))
    .all();

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
    annualProjection: frivolousTotal * 12,
    byCategory: [...byCategory.values()].sort((a, b) => b.value - a.value),
  };
}

// === CATEGORY TRENDS ===

export function getCategoryTrends(months: number = 3) {
  const results: { month: string; categories: { name: string; total: number; color: string }[] }[] = [];

  const internalCats = getInternalCategoryIds();
  const excludedAccounts = getExcludedAccountIds();

  for (let i = 0; i < months; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const monthStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0];
    const monthLabel = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });

    const cats = db
      .select({
        name: schema.categories.name,
        color: schema.categories.color,
        total: sql<number>`SUM(${schema.transactions.amount})`,
      })
      .from(schema.transactions)
      .leftJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
      .where(and(
        eq(schema.transactions.type, "expense"),
        gte(schema.transactions.date, monthStart),
        lte(schema.transactions.date, monthEnd),
        internalCats.length > 0 ? notInArray(schema.transactions.categoryId, internalCats) : undefined,
        excludedAccounts.length > 0 ? notInArray(schema.transactions.accountId, excludedAccounts) : undefined,
      ))
      .groupBy(schema.categories.name)
      .orderBy(desc(sql`SUM(${schema.transactions.amount})`))
      .all();

    results.push({
      month: monthLabel,
      categories: cats.map((c) => ({ name: c.name ?? "Other", total: c.total, color: c.color ?? "#6b7280" })),
    });
  }

  return results.reverse();
}

// === CASH FLOW FORECAST ===

export function getCashFlowForecast(days: number = 90) {
  const monthStart = getMonthStart();
  const today = getToday();

  const actuals = getSpendingByDay(monthStart, today);

  // Calculate daily averages from actual data
  const totalDays = actuals.length || 1;
  const avgDailyExpenses = Math.round(actuals.reduce((s, d) => s + d.expenses, 0) / totalDays);
  const avgDailyIncome = Math.round(actuals.reduce((s, d) => s + d.income, 0) / totalDays);

  // Project forward
  const projected: { date: string; expenses: number; income: number; isProjected: boolean }[] = [];

  // Add actuals
  for (const day of actuals) {
    projected.push({ date: day.date, expenses: day.expenses, income: day.income, isProjected: false });
  }

  // Add projections
  const todayDate = new Date(today);
  for (let i = 1; i <= days; i++) {
    const d = new Date(todayDate);
    d.setDate(d.getDate() + i);
    projected.push({
      date: d.toISOString().split("T")[0],
      expenses: avgDailyExpenses,
      income: avgDailyIncome,
      isProjected: true,
    });
  }

  const projectedNetMonthly = (avgDailyIncome - avgDailyExpenses) * 30;

  return { data: projected, avgDailyExpenses, avgDailyIncome, projectedNetMonthly };
}

import { db, schema } from "@/lib/db";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";

function getMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

export function getMetrics() {
  const monthStart = getMonthStart();

  const spending = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)` })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.type, "expense"), gte(schema.transactions.date, monthStart)))
    .get();

  const income = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)` })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.type, "income"), gte(schema.transactions.date, monthStart)))
    .get();

  // Previous month for comparison
  const d = new Date();
  const prevMonthStart = new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().split("T")[0];
  const prevMonthEnd = new Date(d.getFullYear(), d.getMonth(), 0).toISOString().split("T")[0];

  const prevSpending = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)` })
    .from(schema.transactions)
    .where(and(
      eq(schema.transactions.type, "expense"),
      gte(schema.transactions.date, prevMonthStart),
      lte(schema.transactions.date, prevMonthEnd)
    ))
    .get();

  const prevIncome = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)` })
    .from(schema.transactions)
    .where(and(
      eq(schema.transactions.type, "income"),
      gte(schema.transactions.date, prevMonthStart),
      lte(schema.transactions.date, prevMonthEnd)
    ))
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

  const results = db
    .select({
      categoryId: schema.transactions.categoryId,
      total: sql<number>`SUM(${schema.transactions.amount})`,
    })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.type, "expense"), gte(schema.transactions.date, monthStart)))
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

  return { debts, totalActive, totalOriginal, totalPaidOff, progress };
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

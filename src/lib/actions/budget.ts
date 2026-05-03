import { db, schema } from "@/lib/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { newId } from "@/lib/utils/ids";
import { now } from "@/lib/utils/format";

function getMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
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
};

export function getBudgetOverview(monthStartOverride?: string): BudgetRow[] {
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

  // Get spending per category this month
  const spending = db
    .select({
      categoryId: schema.transactions.categoryId,
      total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)`,
    })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.type, "expense"), gte(schema.transactions.date, monthStart)))
    .groupBy(schema.transactions.categoryId)
    .all();

  const spentMap = Object.fromEntries(spending.map((s) => [s.categoryId, s.total]));

  return budgets.map((b) => {
    const spent = spentMap[b.categoryId ?? ""] ?? 0;
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

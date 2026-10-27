import { db, schema } from "@/lib/db";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { newId } from "@/lib/utils/ids";
import { now } from "@/lib/utils/format";
import { getHouseholdConfig } from "./config";
import { getHouseholdLines } from "./lines";
import { lineAmount } from "./calc";

/**
 * The household plan is the budget. Every plan line tracks against one
 * spending category, and the `budgets` table — which the dashboard, reports,
 * cash-flow forecast and chat all read — is rebuilt from the plan whenever it
 * changes. Nothing else should write `budgets`.
 */

// Categories the plan needs that the original category set didn't have.
const PLAN_CATEGORIES: Array<{ name: string; group: string; color: string }> = [
  { name: "Giving", group: "Personal", color: "#0d9488" },
  { name: "Kids & Childcare", group: "Personal", color: "#f59e0b" },
  { name: "Pets", group: "Personal", color: "#a16207" },
];

// Line label (prefix) → category name. Lines not listed here stay unlinked
// until someone picks a category for them on /budget.
const LINE_CATEGORY: Array<[labelPrefix: string, category: string]> = [
  ["Tithe", "Giving"],
  ["Renters insurance", "Insurance"],
  ["Rent", "Housing"],
  ["Electric", "Utilities"],
  ["Water and sewer", "Utilities"],
  ["Gas", "Utilities"],
  ["Internet", "Internet"],
  ["Neriah", "Kids & Childcare"],
  ["Daycare", "Kids & Childcare"],
  ["Clothes, sports", "Kids & Childcare"],
  ["Auto loan", "Car Payment"],
  ["Auto insurance", "Auto Insurance"],
  ["Fuel", "Gas & Fuel"],
  ["Maintenance fund", "Car Care"],
  ["Tolls", "Transport"],
  ["Groceries", "Groceries"],
  ["Eating out", "Restaurants"],
  ["Household and miscellaneous", "Shopping"],
  ["AT&T", "Phone"],
  ["Verizon", "Phone"],
  ["Vitamins", "Health"],
  ["Pharmacy", "Pharmacy"],
  ["Personal subscriptions", "Subscriptions"],
  ["Pets", "Pets"],
  ["Anthropic", "AI Tools"],
  ["OpenAI", "AI Tools"],
  ["DigitalOcean", "Web Hosting"],
  ["Kinsta", "Web Hosting"],
  ["Pantheon", "Web Hosting"],
  ["Supabase", "SaaS & Dev Tools"],
  ["April's credit card", "Debt Payment"],
  ["Apple Card", "Debt Payment"],
  ["IRS installment", "Taxes"],
  ["Ring", "Loan Payment"],
];

const LINKED_FLAG = "household_lines_linked";

export function ensurePlanCategories() {
  const groups = db.select().from(schema.categoryGroups).all();
  const existing = new Set(db.select({ name: schema.categories.name }).from(schema.categories).all().map((c) => c.name));
  for (const c of PLAN_CATEGORIES) {
    if (existing.has(c.name)) continue;
    db.insert(schema.categories)
      .values({
        id: newId(),
        name: c.name,
        color: c.color,
        groupId: groups.find((g) => g.name === c.group)?.id ?? null,
        isSystem: false,
        createdAt: now(),
      })
      .run();
  }
}

/** One-time: link the seeded plan lines to categories by label. */
export function linkHouseholdLinesOnce(): boolean {
  const flag = db.select().from(schema.settings).where(eq(schema.settings.key, LINKED_FLAG)).get();
  if (flag) return false;
  ensurePlanCategories();
  const byName = new Map(db.select().from(schema.categories).all().map((c) => [c.name, c.id]));
  db.transaction((tx) => {
    for (const line of getHouseholdLines()) {
      if (line.categoryId) continue;
      const match = LINE_CATEGORY.find(([prefix]) => line.label.startsWith(prefix));
      const categoryId = match ? byName.get(match[1]) : undefined;
      if (!categoryId) continue;
      tx.update(schema.householdLines).set({ categoryId }).where(eq(schema.householdLines.id, line.id)).run();
    }
    tx.insert(schema.settings).values({ key: LINKED_FLAG, value: now(), updatedAt: now() }).run();
  });
  syncBudgetsFromPlan();
  return true;
}

/** Rebuild `budgets` from the plan: one row per linked category, plus Savings. */
export function syncBudgetsFromPlan() {
  const { income } = getHouseholdConfig();
  const totals = new Map<string, number>();
  for (const line of getHouseholdLines()) {
    if (!line.categoryId) continue;
    totals.set(line.categoryId, (totals.get(line.categoryId) ?? 0) + Math.round(lineAmount(line, income) * 100));
  }
  const savings = db.select().from(schema.categories).where(eq(schema.categories.name, "Savings")).get();
  if (savings && income.savings > 0) {
    totals.set(savings.id, (totals.get(savings.id) ?? 0) + Math.round(income.savings * 100));
  }
  const timestamp = now();
  db.transaction((tx) => {
    tx.delete(schema.budgets).run();
    for (const [categoryId, amount] of totals) {
      if (amount <= 0) continue;
      tx.insert(schema.budgets)
        .values({ id: newId(), categoryId, amount, period: "monthly", createdAt: timestamp })
        .run();
    }
  });
}

/** Expense cents per category since the first of this month. */
export function getMonthSpendByCategory(): Record<string, number> {
  const d = new Date();
  const monthStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const rows = db
    .select({
      categoryId: schema.transactions.categoryId,
      total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)`,
    })
    .from(schema.transactions)
    .where(
      and(
        isNotNull(schema.transactions.categoryId),
        gte(schema.transactions.date, monthStart),
        eq(schema.transactions.type, "expense"),
      ),
    )
    .groupBy(schema.transactions.categoryId)
    .all();
  return Object.fromEntries(rows.map((r) => [r.categoryId!, r.total]));
}

/** Spending categories a plan line can track against (no income/internal). */
export function getTrackableCategories() {
  return db
    .select({ id: schema.categories.id, name: schema.categories.name, groupName: schema.categoryGroups.name })
    .from(schema.categories)
    .leftJoin(schema.categoryGroups, eq(schema.categories.groupId, schema.categoryGroups.id))
    .all()
    .filter((c) => c.groupName !== "Income" && c.groupName !== "Internal")
    .sort((a, b) => (a.groupName ?? "").localeCompare(b.groupName ?? "") || a.name.localeCompare(b.name));
}

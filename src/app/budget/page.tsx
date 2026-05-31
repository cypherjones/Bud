import {
  getBudgetOverview,
  getBudgetStrategy,
  getBudgetSuggestions,
  getActionQueue,
  getUnbudgetedSpendingRows,
  getStaleBudgets,
} from "@/lib/actions/budget";
import { getActiveReportingMonth } from "@/lib/actions/dashboard";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { TodayPulse } from "@/components/budget/today-pulse";
import { StaleBudgetBanner } from "@/components/budget/stale-budget-banner";
import { PhaseStrip } from "@/components/budget/phase-strip";
import { AllocationCards } from "@/components/budget/allocation-cards";
import { GoalCommitments } from "@/components/budget/goal-commitments";
import { ActionQueue } from "@/components/budget/action-queue";
import { BudgetTable } from "@/components/budget/budget-table";
import { PlanChecklist } from "@/components/budget/plan-checklist";
import { getActionPlanItems, seedCashFlowPlanIfEmpty } from "@/lib/actions/action-plan";
import { EmptyMonthBanner } from "@/components/dashboard/empty-month-banner";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  const activeMonth = getActiveReportingMonth();
  const overview = getBudgetOverview(activeMonth.monthStart);
  const strategy = getBudgetStrategy();
  const suggestions = getBudgetSuggestions();
  const actions = getActionQueue();
  const unbudgetedRows = getUnbudgetedSpendingRows();
  const staleBudgets = getStaleBudgets();
  // Seed the cash-flow plan once if the user has no plan items yet. Idempotent —
  // skips on every visit after the first.
  seedCashFlowPlanIfEmpty();
  const planItems = getActionPlanItems();

  // Categories list for the inline "add budget" UI inside BudgetTable.
  const allCategories = await db
    .select({
      id: schema.categories.id,
      name: schema.categories.name,
      color: schema.categories.color,
      groupName: schema.categoryGroups.name,
    })
    .from(schema.categories)
    .leftJoin(schema.categoryGroups, eq(schema.categories.groupId, schema.categoryGroups.id))
    .all();
  const budgetedCategoryIds = new Set(overview.map((b) => b.categoryId));
  const unbudgetedCategories = allCategories.filter((c) => !budgetedCategoryIds.has(c.id));

  // Wire the Buffer card → Savings budget row anchor. If the user doesn't have
  // a Savings budget, the link silently disappears.
  const savingsBudget = overview.find((r) => r.categoryName === "Savings");
  const savingsBudgetCategoryId = savingsBudget?.categoryId ?? null;
  const savingsBudgetCents = savingsBudget?.budgeted ?? 0;

  return (
    <div className="flex flex-col h-screen">
      <header className="px-8 py-6 border-b border-border bg-card/50">
        <h1 className="text-2xl font-bold tracking-tight">Budget</h1>
        <p className="text-sm text-muted-foreground">
          Strategy execution surface — {activeMonth.monthLabel}
        </p>
      </header>
      <div className="flex-1 overflow-auto p-8 space-y-6">
        {activeMonth.isFallback && activeMonth.fallbackReason && (
          <EmptyMonthBanner reason={activeMonth.fallbackReason} />
        )}

        {/* 0. TodayPulse — the everyday-clarity widget. Three sentences:
              today's balance, next-7-day trough, next paycheck. Standard apps
              get this right; we were missing it until now. */}
        <TodayPulse strategy={strategy} />

        {/* 0a. Stale budget banner — flags budgets with no active recurring
              and < 20% trailing spend. Quietly skews the cash-flow forecast
              if left alone (Geico Auto Insurance was exactly this). */}
        <StaleBudgetBanner staleBudgets={staleBudgets} />

        {/* 1. PhaseStrip — slim banner replacing the old ActionOfTheWeekCard.
              The top-3 CTAs that used to live here duplicated the ActionQueue
              below, so they were cut. */}
        <PhaseStrip strategy={strategy} />

        {/* 2. Allocation — single card now (income context folded into header,
              bar + 5 bucket cards inside). Drill-down expansion removed since
              the budget table groups already show category-level detail. */}
        <AllocationCards strategy={strategy} />

        {/* 3. Goals — Buffer + Houston. Buffer card scrolls to Savings budget row. */}
        <GoalCommitments
          strategy={strategy}
          savingsBudgetCategoryId={savingsBudgetCategoryId}
          savingsBudgetCents={savingsBudgetCents}
        />

        {/* 4. Action queue — every action ranked. The page's reason to exist. */}
        <ActionQueue actions={actions} suggestions={suggestions} />

        {/* 4b. Persistent action plan — strategic checklist that survives sessions.
              Action queue is auto-derived; this is user-curated. */}
        <PlanChecklist items={planItems} />

        {/* 5. Budget table — grouped, with unbudgeted-with-spend rows + totals
              footer. Edit/remove anything inline. */}
        <BudgetTable
          rows={overview}
          unbudgetedRows={unbudgetedRows}
          unbudgetedCategories={unbudgetedCategories}
          budgetCoveragePercent={strategy.budgetCoveragePercent}
        />
      </div>
    </div>
  );
}

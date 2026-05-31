import {
  getMonthlySummary,
  getSubscriptionAudit,
  getFrivolousSpending,
  getCategoryTrends,
  getCashFlowForecast,
  getSpendingVelocity,
} from "@/lib/actions/reports";
import { getActiveReportingMonth } from "@/lib/actions/dashboard";
import { getDebtStrategy } from "@/lib/actions/debts";
import { getMoveReadiness } from "@/lib/actions/move-readiness";
import { getCreditTrajectory } from "@/lib/actions/credit-trajectory";
import { ReportTabs } from "@/components/reports/report-tabs";
import { EmptyMonthBanner } from "@/components/dashboard/empty-month-banner";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const activeMonth = getActiveReportingMonth();

  // Monthly Summary, Spending-by-Day, and Frivolous accept a startDate / monthStart
  // override and respect the fallback. Velocity, CashFlowForecast, etc. are
  // current-month-bound — when the active month is the current month they show
  // the same view; when we fall back to prior month the cards may show 0
  // because the helpers compute "this month so far." That's noted in the banner.
  const monthlySummary = getMonthlySummary(activeMonth.monthStart);
  const velocity = getSpendingVelocity();
  const subscriptions = getSubscriptionAudit();
  const frivolous = getFrivolousSpending(activeMonth.monthStart);
  const categoryTrends = getCategoryTrends(6);
  // 75 days = ~through end of next month + buffer, so the "End of Next Month"
  // headline always lands inside the projection window. A 30-day window cut off
  // 3-4 future paychecks and made next month's balance look like a cliff.
  const cashFlow = getCashFlowForecast(75);
  const debtStrategy = getDebtStrategy();
  const moveReadiness = getMoveReadiness();
  const creditTrajectory = getCreditTrajectory();

  // Categories list for inline recategorization in the Discretionary "Other"
  // bucket drill-down. Same shape /transactions uses.
  const categories = db
    .select({
      id: schema.categories.id,
      name: schema.categories.name,
      color: schema.categories.color,
      groupId: schema.categories.groupId,
      groupName: schema.categoryGroups.name,
      groupColor: schema.categoryGroups.color,
      groupSort: schema.categoryGroups.sortOrder,
    })
    .from(schema.categories)
    .leftJoin(schema.categoryGroups, eq(schema.categories.groupId, schema.categoryGroups.id))
    .all();

  return (
    <div className="flex flex-col h-screen">
      <header className="px-8 py-6 border-b border-border bg-card/50">
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Actionable insights — {activeMonth.monthLabel}
        </p>
      </header>
      <div className="flex-1 overflow-auto p-8 space-y-4">
        {activeMonth.isFallback && activeMonth.fallbackReason && (
          <EmptyMonthBanner reason={activeMonth.fallbackReason} />
        )}
        <ReportTabs
          monthlySummary={monthlySummary}
          velocity={velocity}
          subscriptions={subscriptions}
          frivolous={frivolous}
          categoryTrends={categoryTrends}
          cashFlow={cashFlow}
          debtStrategy={debtStrategy}
          moveReadiness={moveReadiness}
          creditTrajectory={creditTrajectory}
          categories={categories}
        />
      </div>
    </div>
  );
}

import {
  getMonthlySummary,
  getSubscriptionAudit,
  getTaxDeductions,
  getFrivolousSpending,
  getCategoryTrends,
  getCashFlowForecast,
  getSpendingByDay,
  getSpendingVelocity,
} from "@/lib/actions/reports";
import { getActiveReportingMonth } from "@/lib/actions/dashboard";
import { ReportTabs } from "@/components/reports/report-tabs";
import { EmptyMonthBanner } from "@/components/dashboard/empty-month-banner";

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
  const dailySpending = getSpendingByDay(activeMonth.monthStart, activeMonth.monthEnd);
  const subscriptions = getSubscriptionAudit();
  const taxDeductions = getTaxDeductions();
  const frivolous = getFrivolousSpending(activeMonth.monthStart);
  const categoryTrends = getCategoryTrends(3);
  const cashFlow = getCashFlowForecast(30);

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
          dailySpending={dailySpending}
          subscriptions={subscriptions}
          taxDeductions={taxDeductions}
          frivolous={frivolous}
          categoryTrends={categoryTrends}
          cashFlow={cashFlow}
        />
      </div>
    </div>
  );
}

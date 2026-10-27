import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SpendingOverview } from "@/components/dashboard/spending-overview";
import { DebtProgress } from "@/components/dashboard/debt-progress";
import { MoveTracker } from "@/components/dashboard/move-tracker";
import { CreditScoreCard } from "@/components/dashboard/credit-score-card";
import { TaxStatusCard } from "@/components/dashboard/tax-status-card";

import { SpendingVelocity } from "@/components/dashboard/spending-velocity";
import { SinceLastVisitStrip } from "@/components/dashboard/since-last-visit-strip";
import { BillClusterBanner } from "@/components/dashboard/bill-cluster-banner";
import { DebtDeadlineBanner } from "@/components/dashboard/debt-deadline-banner";
import { SavingsTargetCard } from "@/components/dashboard/savings-target-card";
import { ActionPlanWidget } from "@/components/dashboard/action-plan-widget";
import { StrategicHero } from "@/components/dashboard/strategic-hero";
import { getBudgetStrategy, getActionQueue } from "@/lib/actions/budget";
import { getUpcomingDebtDeadlines } from "@/lib/actions/debts";
import { Wallet, TrendingDown, TrendingUp } from "lucide-react";
import {
  getMetrics,
  getSpendingByCategory,
  getDebtSummary,
  getMovePlan,
  getCreditSummary,
  getTaxSummary,
  getUpcomingBillsCount,
  getUpcomingBillsWindow,
  getSinceLastVisit,
  getTotalBalance,
  getDebtFreeProjection,
  getUpcomingBillCluster,
  getSavingsTarget,
  getKillList,
} from "@/lib/actions/dashboard";
import { getSpendingVelocity, getSpendingByDay } from "@/lib/actions/reports";
import { formatCurrency } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const metrics = getMetrics();
  const spendingData = getSpendingByCategory();
  const debtData = getDebtSummary();
  const movePlan = getMovePlan();
  const creditData = getCreditSummary();
  const taxData = getTaxSummary();
  const upcomingBillsCount = getUpcomingBillsCount();
  const velocity = getSpendingVelocity();
  const monthStart = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; })();
  const dailySpending = getSpendingByDay(monthStart, new Date().toISOString().split("T")[0]);
  const sinceLastVisit = getSinceLastVisit();
  const balanceInfo = getTotalBalance();
  const debtFree = getDebtFreeProjection();
  const billCluster = getUpcomingBillCluster();
  const debtDeadlines = getUpcomingDebtDeadlines(30);
  const savingsTarget = getSavingsTarget();
  const bills7d = getUpcomingBillsWindow(7);
  const killList = getKillList();
  // Strategic hero — same data /budget uses, surfaced on home so the user
  // sees phase + projected EOM + top 3 actions without navigating.
  const budgetStrategy = getBudgetStrategy();
  const topActions = getActionQueue().slice(0, 3);

  // Two distinct empty states:
  //   - hasAccounts: any non-excluded bank account exists (regardless of whether
  //     this month has transactions yet). Drives the "Connect accounts" placeholder.
  //   - hasMonthData: at least one transaction in the current month. Drives whether
  //     to show real $ values vs. the "month just started" subtitle.
  const hasAccounts = balanceInfo.accountCount > 0;
  const hasMonthData = velocity.totalSpent > 0 || metrics.income > 0;

  // velocity.totalSpent is the canonical MTD-spent figure (same filters as
  // metrics.spending by construction); using it here removes the temptation
  // to render two different "this month" numbers.
  const spendingTrend =
    metrics.prevSpending > 0
      ? Math.round(((velocity.totalSpent - metrics.prevSpending) / metrics.prevSpending) * 100)
      : null;

  // Income headline always uses the trailing 30 days. Paychecks land at the
  // end of the prior month and fund the current month's spending, so a strict
  // calendar-MTD figure is misleading (it shows $0.05 on May 2 while April's
  // payroll is what's actually paying May's bills).
  const incomeValue = metrics.trailing30Income;
  const trailingIncomeTrend =
    metrics.priorTrailing30Income > 0
      ? Math.round(((metrics.trailing30Income - metrics.priorTrailing30Income) / metrics.priorTrailing30Income) * 100)
      : null;
  const incomeSubtitle = !hasAccounts ? "Connect accounts to start" : "Last 30 days";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-8 py-6 border-b border-border bg-card/50">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Your financial command center
        </p>
      </header>

      {/* Dashboard grid */}
      <div className="flex-1 overflow-auto p-8">
        <div className="mb-6 space-y-3">
          <SinceLastVisitStrip {...sinceLastVisit} />
          <DebtDeadlineBanner deadlines={debtDeadlines} />
          <BillClusterBanner cluster={billCluster} />
        </div>

        {/* Strategic hero — phase + accounting + top 3 actions. Replaces the
            "data viewer" feel with "where am I + what to do." */}
        <div className="mb-6">
          <StrategicHero strategy={budgetStrategy} topActions={topActions} />
        </div>

        {/* Top row: balance + income (Monthly Spending merged into the
            SpendingVelocity card below — they shared a topic and the velocity
            card had a lot of empty space). */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <MetricCard
            title="Total Balance"
            icon={<Wallet className="w-5 h-5 text-primary" />}
            value={hasAccounts ? formatCurrency(balanceInfo.totalBalance) : "--"}
            subtitle={
              !hasAccounts
                ? "Connect accounts to start"
                : `Across ${balanceInfo.accountCount} ${balanceInfo.accountCount === 1 ? "account" : "accounts"}`
            }
            trend={null}
          />
          <MetricCard
            title="Income (30d)"
            icon={<TrendingUp className="w-5 h-5 text-green-500" />}
            value={hasAccounts ? formatCurrency(incomeValue) : "--"}
            subtitle={incomeSubtitle}
            trend={hasAccounts ? trailingIncomeTrend : null}
          />
        </div>

        {/* Middle row: charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <SpendingOverview data={spendingData} />
          <SpendingVelocity
            velocity={velocity}
            dailySpending={dailySpending}
            spendingTrend={hasMonthData ? spendingTrend : null}
          />
          <DebtProgress
            debts={debtData.debts}
            totalActive={debtData.totalActive}
            totalOriginal={debtData.totalOriginal}
            progress={debtData.progress}
            monthRecommended={debtData.monthRecommended}
            monthActual={debtData.monthActual}
            debtFreeAt={debtFree.atRecommended ?? debtFree.atMinimum}
            debtFreeMonths={debtFree.monthsAtRecommended ?? debtFree.monthsAtMinimum}
          />
        </div>

        {/* Savings target row */}
        <div className="grid grid-cols-1 mb-6">
          <SavingsTargetCard data={savingsTarget} />
        </div>

        {/* Action Plan: this week's bills + sub kill-list checkbox */}
        <div className="grid grid-cols-1 mb-6">
          <ActionPlanWidget
            bills7d={bills7d}
            killList={killList.items}
            killListMonthly={killList.totalMonthly}
          />
        </div>

        {/* Bottom row: planning */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <MoveTracker data={movePlan} />
          <CreditScoreCard data={creditData} />
          <TaxStatusCard
            obligations={taxData.obligations}
            totalOwed={taxData.totalOwed}
            nextDue={taxData.nextDue}
          />
        </div>

        {/* Upcoming bills link */}
        <a href="/schedule" className="block mb-6">
          <Card className="hover:bg-accent/30 transition-colors cursor-pointer">
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center">
                  <TrendingDown className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">Upcoming Bills</p>
                  <p className="text-xs text-muted-foreground">{upcomingBillsCount} recurring charges scheduled</p>
                </div>
              </div>
              <span className="text-sm font-medium text-muted-foreground">View Schedule →</span>
            </CardContent>
          </Card>
        </a>
      </div>

    </div>
  );
}

function MetricCard({
  title,
  icon,
  value,
  subtitle,
  trend,
}: {
  title: string;
  icon: React.ReactNode;
  value: string;
  subtitle: string;
  trend: number | null;
}) {
  const trendColor =
    trend === null ? "" : trend >= 0 ? "text-green-600" : "text-red-500";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tracking-tight">{value}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-sm text-muted-foreground">{subtitle}</span>
          {trend !== null && (
            <span className={`text-sm font-medium ${trendColor}`}>
              {trend >= 0 ? "+" : ""}
              {trend}%
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

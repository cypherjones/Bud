import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SpendingOverview } from "@/components/dashboard/spending-overview";
import { DebtProgress } from "@/components/dashboard/debt-progress";
import { MoveTracker } from "@/components/dashboard/move-tracker";
import { CreditScoreCard } from "@/components/dashboard/credit-score-card";
import { TaxStatusCard } from "@/components/dashboard/tax-status-card";

import { SpendingVelocity } from "@/components/dashboard/spending-velocity";
import { SinceLastVisitStrip } from "@/components/dashboard/since-last-visit-strip";
import { BillClusterBanner } from "@/components/dashboard/bill-cluster-banner";
import { Wallet, TrendingDown, TrendingUp } from "lucide-react";
import {
  getMetrics,
  getSpendingByCategory,
  getDebtSummary,
  getMovePlan,
  getCreditSummary,
  getTaxSummary,
  getUpcomingBills,
  getSinceLastVisit,
  getTotalBalance,
  getDebtFreeProjection,
  getUpcomingBillCluster,
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
  const bills = getUpcomingBills();
  const velocity = getSpendingVelocity();
  const monthStart = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; })();
  const dailySpending = getSpendingByDay(monthStart, new Date().toISOString().split("T")[0]);
  const sinceLastVisit = getSinceLastVisit();
  const balanceInfo = getTotalBalance();
  const debtFree = getDebtFreeProjection();
  const billCluster = getUpcomingBillCluster();

  // Two distinct empty states:
  //   - hasAccounts: any non-excluded bank account exists (regardless of whether
  //     this month has transactions yet). Drives the "Connect accounts" placeholder.
  //   - hasMonthData: at least one transaction in the current month. Drives whether
  //     to show real $ values vs. the "month just started" subtitle.
  const hasAccounts = balanceInfo.accountCount > 0;
  const hasMonthData = metrics.spending > 0 || metrics.income > 0;

  const spendingTrend =
    metrics.prevSpending > 0
      ? Math.round(((metrics.spending - metrics.prevSpending) / metrics.prevSpending) * 100)
      : null;

  const incomeTrend =
    metrics.prevIncome > 0
      ? Math.round(((metrics.income - metrics.prevIncome) / metrics.prevIncome) * 100)
      : null;

  // For the "month just started" subtitle.
  const monthName = new Date().toLocaleDateString("en-US", { month: "long" });
  const dayOfMonth = new Date().getDate();
  const monthEmptyHint = `${monthName} just started — sync to load`;
  const monthEarlyHint = `${monthName} day ${dayOfMonth} — sync for the latest`;
  const emptyMonthSubtitle = dayOfMonth <= 3 ? monthEmptyHint : monthEarlyHint;

  return (
    <div className="flex flex-col h-screen">
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
          <BillClusterBanner cluster={billCluster} />
        </div>

        {/* Top row: key metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <MetricCard
            title="Total Balance"
            icon={<Wallet className="w-5 h-5 text-primary" />}
            value={hasAccounts ? formatCurrency(balanceInfo.totalBalance) : "--"}
            subtitle={
              !hasAccounts
                ? "Connect accounts to start"
                : hasMonthData
                  ? `${formatCurrency(metrics.income - metrics.spending)} net this month`
                  : `Across ${balanceInfo.accountCount} accounts`
            }
            trend={null}
          />
          <MetricCard
            title="Monthly Spending"
            icon={<TrendingDown className="w-5 h-5 text-red-500" />}
            value={hasAccounts ? formatCurrency(metrics.spending) : "--"}
            subtitle={
              !hasAccounts
                ? "Connect accounts to start"
                : hasMonthData
                  ? "This month"
                  : emptyMonthSubtitle
            }
            trend={hasMonthData ? spendingTrend : null}
            trendInverse
          />
          <MetricCard
            title="Monthly Income"
            icon={<TrendingUp className="w-5 h-5 text-green-500" />}
            value={hasAccounts ? formatCurrency(metrics.income) : "--"}
            subtitle={
              !hasAccounts
                ? "Connect accounts to start"
                : hasMonthData
                  ? "This month"
                  : emptyMonthSubtitle
            }
            trend={hasMonthData ? incomeTrend : null}
          />
        </div>

        {/* Middle row: charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <SpendingOverview data={spendingData} />
          <SpendingVelocity velocity={velocity} dailySpending={dailySpending} />
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
                  <p className="text-xs text-muted-foreground">{bills.length} recurring charges scheduled</p>
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
  trendInverse,
}: {
  title: string;
  icon: React.ReactNode;
  value: string;
  subtitle: string;
  trend: number | null;
  trendInverse?: boolean;
}) {
  const trendColor =
    trend === null
      ? ""
      : trendInverse
      ? trend <= 0
        ? "text-green-600"
        : "text-red-500"
      : trend >= 0
      ? "text-green-600"
      : "text-red-500";

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

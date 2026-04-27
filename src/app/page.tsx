import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SpendingOverview } from "@/components/dashboard/spending-overview";
import { DebtProgress } from "@/components/dashboard/debt-progress";
import { MoveTracker } from "@/components/dashboard/move-tracker";
import { CreditScoreCard } from "@/components/dashboard/credit-score-card";
import { TaxStatusCard } from "@/components/dashboard/tax-status-card";
import { UpcomingBills } from "@/components/dashboard/upcoming-bills";
import { ChatPanel } from "@/components/chat/chat-interface";
import { Wallet, TrendingDown, TrendingUp } from "lucide-react";
import {
  getMetrics,
  getSpendingByCategory,
  getDebtSummary,
  getMovePlan,
  getCreditSummary,
  getTaxSummary,
  getUpcomingBills,
} from "@/lib/actions/dashboard";
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

  const hasTransactions = metrics.spending > 0 || metrics.income > 0;

  const spendingTrend =
    metrics.prevSpending > 0
      ? Math.round(((metrics.spending - metrics.prevSpending) / metrics.prevSpending) * 100)
      : null;

  const incomeTrend =
    metrics.prevIncome > 0
      ? Math.round(((metrics.income - metrics.prevIncome) / metrics.prevIncome) * 100)
      : null;

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
        {/* Top row: key metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <MetricCard
            title="Total Balance"
            icon={<Wallet className="w-5 h-5 text-primary" />}
            value={hasTransactions ? formatCurrency(metrics.income - metrics.spending) : "--"}
            subtitle={hasTransactions ? "This month net" : "Connect accounts to start"}
            trend={null}
          />
          <MetricCard
            title="Monthly Spending"
            icon={<TrendingDown className="w-5 h-5 text-red-500" />}
            value={hasTransactions ? formatCurrency(metrics.spending) : "--"}
            subtitle={hasTransactions ? "This month" : "No transactions yet"}
            trend={spendingTrend}
            trendInverse
          />
          <MetricCard
            title="Monthly Income"
            icon={<TrendingUp className="w-5 h-5 text-green-500" />}
            value={hasTransactions ? formatCurrency(metrics.income) : "--"}
            subtitle={hasTransactions ? "This month" : "No transactions yet"}
            trend={incomeTrend}
          />
        </div>

        {/* Middle row: charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <SpendingOverview data={spendingData} />
          <DebtProgress
            debts={debtData.debts}
            totalActive={debtData.totalActive}
            totalOriginal={debtData.totalOriginal}
            progress={debtData.progress}
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

        {/* Upcoming bills */}
        <div className="mb-6">
          <UpcomingBills bills={bills} />
        </div>
      </div>

      {/* Persistent chat panel */}
      <ChatPanel />
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

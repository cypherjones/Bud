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
import { ReportTabs } from "@/components/reports/report-tabs";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const monthStart = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  })();
  const today = new Date().toISOString().split("T")[0];

  const monthlySummary = getMonthlySummary();
  const velocity = getSpendingVelocity();
  const dailySpending = getSpendingByDay(monthStart, today);
  const subscriptions = getSubscriptionAudit();
  const taxDeductions = getTaxDeductions();
  const frivolous = getFrivolousSpending();
  const categoryTrends = getCategoryTrends(3);
  const cashFlow = getCashFlowForecast(30);

  return (
    <div className="flex flex-col h-screen">
      <header className="px-8 py-6 border-b border-border bg-card/50">
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Actionable insights into your finances
        </p>
      </header>
      <div className="flex-1 overflow-auto p-8">
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

"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MonthlySummary } from "./monthly-summary";
import { SubscriptionAudit } from "./subscription-audit";
import { TaxDeductionReport } from "./tax-deduction-report";
import { FrivolousReport } from "./frivolous-report";
import { CategoryTrends } from "./category-trends";
import { CashFlowForecast } from "./cash-flow-forecast";

type Props = {
  monthlySummary: {
    expenses: number;
    income: number;
    savingsRate: number;
    topCategories: { name: string | null; color: string | null; total: number; count: number }[];
    topMerchants: { merchant: string | null; total: number; count: number }[];
  };
  velocity: {
    totalSpent: number;
    dailyRate: number;
    projectedMonthTotal: number;
    daysElapsed: number;
    daysRemaining: number;
    daysInMonth: number;
    totalBudget: number;
    onTrack: boolean | null;
  };
  dailySpending: { date: string; expenses: number; income: number }[];
  subscriptions: {
    subscriptions: { merchant: string; monthlyCost: number; category: string | null; lastSeen: string; flaggedCancel: boolean }[];
    totalMonthly: number;
    totalAnnual: number;
    cancelledMonthlySavings: number;
  };
  taxDeductions: {
    groups: { category: string; items: { merchant: string | null; amount: number; date: string }[]; total: number }[];
    total: number;
    count: number;
  };
  frivolous: {
    items: { merchant: string | null; amount: number; date: string; categoryName: string | null }[];
    total: number;
    percentage: number;
    annualProjection: number;
    byCategory: { name: string; value: number; color: string }[];
  };
  categoryTrends: { month: string; categories: { name: string; total: number; color: string }[] }[];
  cashFlow: {
    data: { date: string; expenses: number; income: number; isProjected: boolean }[];
    avgDailyExpenses: number;
    avgDailyIncome: number;
    projectedNetMonthly: number;
  };
};

export function ReportTabs(props: Props) {
  return (
    <Tabs defaultValue="summary" className="space-y-6">
      <TabsList className="flex-wrap h-auto gap-1">
        <TabsTrigger value="summary">Monthly Summary</TabsTrigger>
        <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
        <TabsTrigger value="tax">Tax Deductions</TabsTrigger>
        <TabsTrigger value="frivolous">Frivolous Spending</TabsTrigger>
        <TabsTrigger value="trends">Category Trends</TabsTrigger>
        <TabsTrigger value="cashflow">Cash Flow</TabsTrigger>
      </TabsList>

      <TabsContent value="summary">
        <MonthlySummary
          summary={props.monthlySummary}
          velocity={props.velocity}
          dailySpending={props.dailySpending}
        />
      </TabsContent>

      <TabsContent value="subscriptions">
        <SubscriptionAudit data={props.subscriptions} />
      </TabsContent>

      <TabsContent value="tax">
        <TaxDeductionReport data={props.taxDeductions} />
      </TabsContent>

      <TabsContent value="frivolous">
        <FrivolousReport data={props.frivolous} />
      </TabsContent>

      <TabsContent value="trends">
        <CategoryTrends data={props.categoryTrends} />
      </TabsContent>

      <TabsContent value="cashflow">
        <CashFlowForecast data={props.cashFlow} />
      </TabsContent>
    </Tabs>
  );
}

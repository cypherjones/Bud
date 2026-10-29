"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MonthlySummary } from "./monthly-summary";
import { SubscriptionAudit } from "./subscription-audit";
import { FrivolousReport } from "./frivolous-report";
import { CategoryTrends } from "./category-trends";
import { CashFlowForecast } from "./cash-flow-forecast";
import { DebtPayoffPlan } from "./debt-payoff-plan";
import { MoveReadinessReport } from "./move-readiness";
import { CreditTrajectoryReport } from "./credit-trajectory";
import type { MoveReadiness } from "@/lib/actions/move-readiness";
import type { CreditTrajectory } from "@/lib/actions/credit-trajectory";

type Props = {
  /** Tab to open first; the home page links straight to "subscriptions". */
  initialTab?: string;
  monthlySummary: {
    expenses: number;
    income: number;
    prevExpenses: number;
    prevIncome: number;
    isPartialMonth: boolean;
    savingsRate: number;
    topCategories: { name: string | null; color: string | null; total: number; count: number }[];
    topMerchants: { merchant: string | null; total: number; count: number }[];
  };
  // MonthlySummary only consumes dailyRate / daysRemaining / daysElapsed;
  // the rest of the velocity payload is dropped at this prop boundary.
  velocity: {
    dailyRate: number;
    daysElapsed: number;
    daysRemaining: number;
  };
  subscriptions: {
    subscriptions: { merchant: string; monthlyCost: number; category: string | null; lastSeen: string; flaggedCancel: boolean; flaggedReimbursable?: boolean; flaggedKillList?: boolean; daysSinceLastSeen?: number; isStale?: boolean }[];
    staleSubscriptions: { merchant: string; monthlyCost: number; category: string | null; lastSeen: string; flaggedCancel: boolean; flaggedReimbursable?: boolean; flaggedKillList?: boolean; daysSinceLastSeen?: number; isStale?: boolean }[];
    reimbursableSubs: { merchant: string; monthlyCost: number; category: string | null; lastSeen: string; flaggedCancel: boolean; flaggedReimbursable?: boolean; flaggedKillList?: boolean; daysSinceLastSeen?: number; isStale?: boolean }[];
    killListSubs: { merchant: string; monthlyCost: number; category: string | null; lastSeen: string; flaggedCancel: boolean; flaggedReimbursable?: boolean; flaggedKillList?: boolean; daysSinceLastSeen?: number; isStale?: boolean }[];
    totalMonthly: number;
    totalAnnual: number;
    reimbursableMonthly: number;
    killListMonthly: number;
    cancelledMonthlySavings: number;
    staleMonthly: number;
  };
  frivolous: {
    items: { merchant: string | null; amount: number; date: string; categoryName: string | null }[];
    total: number;
    percentage: number;
    monthlyProjection: number;
    annualProjection: number;
    daysInWindow: number;
    isVolatile: boolean;
    byCategory: { name: string; value: number; color: string }[];
    otherCategoryItems: { id: string; merchant: string | null; amount: number; date: string; categoryId: string | null; categoryName: string | null; categoryColor: string | null }[];
    otherCategoryTotal: number;
  };
  categoryTrends: {
    month: string;
    categories: { id: string | null; name: string; total: number; color: string }[];
    isPartial: boolean;
    daysCovered: number;
    daysInMonth: number;
  }[];
  cashFlow: {
    data: { date: string; expenses: number; income: number; isProjected: boolean; projectedBalance: number }[];
    startingBalance: number;
    endOfMonthBalance: number;
    endOfNextMonthBalance: number;
    lowestProjected: { balance: number; date: string } | null;
    projectedNet30: number;
    survivalFloor: number;
    breachesFloor: boolean;
    variableDailyRate: number;
    cappedCategoryCount: number;
    variableBreakdown: { categoryName: string; trailing30: number; budget: number | null; effective: number }[];
  };
  debtStrategy: {
    totalBalance: number;
    totalMinimums: number;
    currentRecommendedTotal: number;
    scenarios: {
      label: string;
      extraMonthly: number;
      monthsToDebtFree: number | null;
      payoffDate: string | null;
      totalInterestPaid: number;
      totalPaid: number;
      interestSavedVsMin: number;
      monthsSavedVsMin: number | null;
    }[];
    avalanche: {
      debtId: string;
      creditorName: string;
      balance: number;
      apr: number;
      minimumPayment: number;
      monthlyInterest: number;
      payoffMonth: number;
      payoffDate: string;
    }[];
    snowballMonths: number | null;
    avalancheMonths: number | null;
    highestImpactTarget: { debtId: string; creditorName: string; reason: string } | null;
  };
  moveReadiness: MoveReadiness;
  creditTrajectory: CreditTrajectory;
  categories: {
    id: string;
    name: string;
    color: string | null;
    groupId: string | null;
    groupName: string | null;
    groupColor: string | null;
    groupSort: number | null;
  }[];
};

export function ReportTabs(props: Props) {
  return (
    <Tabs defaultValue={props.initialTab ?? "move"} className="space-y-6">
      <TabsList className="flex-wrap h-auto gap-1">
        <TabsTrigger value="move">Move Readiness</TabsTrigger>
        <TabsTrigger value="credit-traj">Credit Trajectory</TabsTrigger>
        <TabsTrigger value="debt">Debt Plan</TabsTrigger>
        <TabsTrigger value="cashflow">Cash Flow</TabsTrigger>
        <TabsTrigger value="summary">Monthly Summary</TabsTrigger>
        <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
        <TabsTrigger value="frivolous">Discretionary</TabsTrigger>
        <TabsTrigger value="trends">Category Trends</TabsTrigger>
      </TabsList>

      <TabsContent value="move">
        <MoveReadinessReport data={props.moveReadiness} />
      </TabsContent>

      <TabsContent value="credit-traj">
        <CreditTrajectoryReport data={props.creditTrajectory} />
      </TabsContent>

      <TabsContent value="debt">
        <DebtPayoffPlan data={props.debtStrategy} />
      </TabsContent>

      <TabsContent value="summary">
        <MonthlySummary
          summary={props.monthlySummary}
          velocity={props.velocity}
          requiredSavingsPace={props.moveReadiness.requiredMonthlyPaceCents}
        />
      </TabsContent>

      <TabsContent value="subscriptions">
        <SubscriptionAudit data={props.subscriptions} />
      </TabsContent>

      <TabsContent value="frivolous">
        <FrivolousReport data={props.frivolous} categories={props.categories} />
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

"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MonthlySummary } from "./monthly-summary";
import { FrivolousReport } from "./frivolous-report";
import { CategoryTrends } from "./category-trends";

type Props = {
  /** Tab to open first. */
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
  const initial = ["summary", "frivolous", "trends"].includes(props.initialTab ?? "") ? props.initialTab : "summary";
  return (
    <Tabs defaultValue={initial} className="space-y-6">
      <TabsList className="flex-wrap h-auto gap-1">
        <TabsTrigger value="summary">This month</TabsTrigger>
        <TabsTrigger value="frivolous">Discretionary</TabsTrigger>
        <TabsTrigger value="trends">Six months</TabsTrigger>
      </TabsList>

      <TabsContent value="summary">
        <MonthlySummary summary={props.monthlySummary} velocity={props.velocity} />
      </TabsContent>

      <TabsContent value="frivolous">
        <FrivolousReport data={props.frivolous} categories={props.categories} />
      </TabsContent>

      <TabsContent value="trends">
        <CategoryTrends data={props.categoryTrends} />
      </TabsContent>
    </Tabs>
  );
}

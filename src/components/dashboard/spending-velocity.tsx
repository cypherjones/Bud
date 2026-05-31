"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";
import { TrendingDown } from "lucide-react";

type Props = {
  velocity: {
    totalSpent: number;
    dailyRate: number;
    projectedMonthTotal: number | null;
    daysElapsed: number;
    daysRemaining: number;
    daysInMonth: number;
    totalBudget: number;
    rateBasis: "mtd" | "trailing_30d";
    onTrack: boolean | null;
  };
  dailySpending: { date: string; expenses: number }[];
  spendingTrend: number | null;
};

export function SpendingVelocity({ velocity, dailySpending, spendingTrend }: Props) {
  // Cumulative MTD spending for the sparkline.
  let cumulative = 0;
  const cumulativeData = dailySpending.map((d) => {
    cumulative += d.expenses / 100;
    return {
      date: new Date(d.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      amount: Math.round(cumulative),
    };
  });

  const noDataYet = velocity.totalSpent === 0;
  const usingTrailing = velocity.rateBasis === "trailing_30d";
  const trendLabel = spendingTrend === null
    ? null
    : `${spendingTrend >= 0 ? "+" : ""}${spendingTrend}% vs same period last month`;
  const trendColor = spendingTrend === null
    ? "text-muted-foreground"
    : spendingTrend > 0
      ? "text-red-500"
      : "text-emerald-500";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Spent this month</CardTitle>
        <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center">
          <TrendingDown className="w-5 h-5 text-red-500" />
        </div>
      </CardHeader>
      <CardContent>
        {/* Headline: month-to-date total + trend */}
        <div className="text-3xl font-bold tracking-tight">
          {formatCurrency(velocity.totalSpent)}
        </div>
        <div className="flex items-center gap-2 mt-1 text-sm">
          <span className="text-muted-foreground">month-to-date</span>
          {trendLabel && (
            <span className={`font-medium ${trendColor}`}>{trendLabel}</span>
          )}
        </div>

        {/* Velocity sub-stat */}
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-xl font-semibold">{formatCurrency(velocity.dailyRate)}</span>
          <span className="text-xs text-muted-foreground">/day</span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">
            {noDataYet
              ? `Day ${velocity.daysElapsed} — no data yet`
              : usingTrailing
                ? "trailing 30-day avg"
                : "month-to-date avg"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {velocity.daysRemaining} {velocity.daysRemaining === 1 ? "day" : "days"} left in month
          {velocity.projectedMonthTotal !== null && (
            <> · projected {formatCurrency(velocity.projectedMonthTotal)}</>
          )}
        </p>

        {cumulativeData.length > 2 && (
          <div className="mt-3">
            <ResponsiveContainer width="100%" height={60}>
              <AreaChart data={cumulativeData}>
                <Tooltip
                  formatter={(value) => [`$${Number(value)}`]}
                  contentStyle={{ borderRadius: 6, fontSize: 11 }}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#e11d48"
                  fill="#e11d48"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";

type Props = {
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
  dailySpending: { date: string; expenses: number }[];
};

export function SpendingVelocity({ velocity, dailySpending }: Props) {
  // Build cumulative spending data
  let cumulative = 0;
  const cumulativeData = dailySpending.map((d) => {
    cumulative += d.expenses / 100;
    return {
      date: new Date(d.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      amount: Math.round(cumulative),
    };
  });

  const paceLabel = velocity.totalBudget > 0
    ? velocity.onTrack ? "Under budget pace" : "Over budget pace"
    : `${velocity.daysRemaining} days left`;

  const PaceIcon = velocity.onTrack === false ? TrendingUp : TrendingDown;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Spending Velocity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight">
            {formatCurrency(velocity.dailyRate)}
          </span>
          <span className="text-xs text-muted-foreground">/day</span>
        </div>
        <div className="flex items-center gap-1 mt-1">
          <span className={`text-xs ${velocity.onTrack === false ? "text-red-500" : "text-muted-foreground"}`}>
            {paceLabel}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Projected: {formatCurrency(velocity.projectedMonthTotal)} this month
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

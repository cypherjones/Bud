"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from "recharts";

type Props = {
  data: {
    data: { date: string; expenses: number; income: number; isProjected: boolean }[];
    avgDailyExpenses: number;
    avgDailyIncome: number;
    projectedNetMonthly: number;
  };
};

export function CashFlowForecast({ data }: Props) {
  const chartData = data.data.map((d) => ({
    date: new Date(d.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    expenses: d.expenses / 100,
    income: d.income / 100,
    net: (d.income - d.expenses) / 100,
    isProjected: d.isProjected,
  }));

  // Find the transition point between actual and projected
  const transitionIdx = chartData.findIndex((d) => d.isProjected);

  // Separate actual and projected for different styling
  const actualData = chartData.filter((d) => !d.isProjected);
  const projectedData = chartData.filter((d) => d.isProjected);

  // Cumulative net cash flow
  let cumulative = 0;
  const cumulativeData = chartData.map((d) => {
    cumulative += d.net;
    return { ...d, cumulative };
  });

  const netIsPositive = data.projectedNetMonthly >= 0;

  return (
    <div className="space-y-6">
      {/* Header Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Avg Daily Expenses</p>
            <p className="text-2xl font-bold tracking-tight mt-1">{formatCurrency(data.avgDailyExpenses)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Avg Daily Income</p>
            <p className="text-2xl font-bold tracking-tight mt-1">{formatCurrency(data.avgDailyIncome)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Projected Net/Month</p>
            <p className={`text-2xl font-bold tracking-tight mt-1 ${netIsPositive ? "text-emerald-600" : "text-red-500"}`}>
              {netIsPositive ? "+" : ""}{formatCurrency(Math.abs(data.projectedNetMonthly))}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Data Points</p>
            <p className="text-2xl font-bold tracking-tight mt-1">
              {actualData.length} actual
            </p>
            <p className="text-xs text-muted-foreground mt-1">{projectedData.length} projected</p>
          </CardContent>
        </Card>
      </div>

      {/* Daily Cash Flow Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Daily Cash Flow (Actual + Projected)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9 }}
                interval={Math.max(0, Math.floor(chartData.length / 10))}
              />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                formatter={(value) => [`$${Number(value).toFixed(2)}`]}
                contentStyle={{ borderRadius: 8, fontSize: 12 }}
              />
              {transitionIdx > 0 && (
                <ReferenceLine
                  x={chartData[transitionIdx]?.date}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  label={{ value: "Projected →", position: "top", fontSize: 10, fill: "#94a3b8" }}
                />
              )}
              <Area
                type="monotone"
                dataKey="income"
                stackId="1"
                stroke="#15803d"
                fill="#15803d"
                fillOpacity={0.15}
                name="Income"
              />
              <Area
                type="monotone"
                dataKey="expenses"
                stackId="2"
                stroke="#e11d48"
                fill="#e11d48"
                fillOpacity={0.15}
                name="Expenses"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Cumulative Net Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Cumulative Net Cash Flow</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={cumulativeData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9 }}
                interval={Math.max(0, Math.floor(cumulativeData.length / 10))}
              />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                formatter={(value) => [`$${Number(value).toFixed(2)}`]}
                contentStyle={{ borderRadius: 8, fontSize: 12 }}
              />
              <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="2 2" />
              <Area
                type="monotone"
                dataKey="cumulative"
                stroke={netIsPositive ? "#15803d" : "#e11d48"}
                fill={netIsPositive ? "#15803d" : "#e11d48"}
                fillOpacity={0.1}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

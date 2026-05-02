"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from "recharts";

type Day = { date: string; expenses: number; income: number; isProjected: boolean; projectedBalance: number };

type Props = {
  data: {
    data: Day[];
    startingBalance: number;
    endOfMonthBalance: number;
    endOfNextMonthBalance: number;
    lowestProjected: { balance: number; date: string } | null;
    projectedNet30: number;
  };
};

function shortDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function CashFlowForecast({ data }: Props) {
  const chartData = data.data.map((d) => ({
    date: shortDate(d.date),
    rawDate: d.date,
    expenses: d.expenses / 100,
    income: d.income / 100,
    projectedBalance: d.isProjected ? d.projectedBalance / 100 : null,
    isProjected: d.isProjected,
  }));

  const transitionIdx = chartData.findIndex((d) => d.isProjected);
  const actualCount = chartData.filter((d) => !d.isProjected).length;
  const projectedCount = chartData.filter((d) => d.isProjected).length;

  const eomDelta = data.endOfMonthBalance - data.startingBalance;
  const enmDelta = data.endOfNextMonthBalance - data.startingBalance;
  const lowestIsConcerning = data.lowestProjected !== null && data.lowestProjected.balance < data.startingBalance * 0.5;

  return (
    <div className="space-y-6">
      {/* Header Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Today&apos;s Balance</p>
            <p className="text-2xl font-bold tracking-tight mt-1">{formatCurrency(data.startingBalance)}</p>
            <p className="text-xs text-muted-foreground mt-1">across non-business accounts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">End of Month</p>
            <p className={`text-2xl font-bold tracking-tight mt-1 ${eomDelta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {formatCurrency(data.endOfMonthBalance)}
            </p>
            <p className={`text-xs mt-1 ${eomDelta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {eomDelta >= 0 ? "+" : "-"}{formatCurrency(Math.abs(eomDelta))} projected
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">End of Next Month</p>
            <p className={`text-2xl font-bold tracking-tight mt-1 ${enmDelta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {formatCurrency(data.endOfNextMonthBalance)}
            </p>
            <p className={`text-xs mt-1 ${enmDelta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {enmDelta >= 0 ? "+" : "-"}{formatCurrency(Math.abs(enmDelta))} from today
            </p>
          </CardContent>
        </Card>
        <Card className={lowestIsConcerning ? "border-amber-300 dark:border-amber-700" : undefined}>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Lowest Projected</p>
            <p className={`text-2xl font-bold tracking-tight mt-1 ${lowestIsConcerning ? "text-amber-600" : ""}`}>
              {data.lowestProjected ? formatCurrency(data.lowestProjected.balance) : "—"}
            </p>
            {data.lowestProjected && (
              <p className="text-xs text-muted-foreground mt-1">on {shortDate(data.lowestProjected.date)}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Projected Balance — the headline view */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Projected Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9 }}
                interval={Math.max(0, Math.floor(chartData.length / 12))}
              />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                formatter={(value, name) => name === "projectedBalance" ? [`$${Number(value).toFixed(2)}`, "Balance"] : null}
                contentStyle={{ borderRadius: 8, fontSize: 12 }}
              />
              <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="2 2" />
              {transitionIdx > 0 && (
                <ReferenceLine
                  x={chartData[transitionIdx]?.date}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  label={{ value: "Today →", position: "top", fontSize: 10, fill: "#94a3b8" }}
                />
              )}
              <Line
                type="monotone"
                dataKey="projectedBalance"
                stroke="#7c3aed"
                strokeWidth={2}
                dot={false}
                connectNulls
                name="Balance"
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-2">
            Walks today&apos;s balance forward day-by-day applying scheduled bills and paychecks from your recurring transactions. Past days are not on this line.
          </p>
        </CardContent>
      </Card>

      {/* Daily Cash Flow — what's hitting on which date */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Daily Cash Flow (Actual + Scheduled)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9 }}
                interval={Math.max(0, Math.floor(chartData.length / 12))}
              />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                formatter={(value) => `$${Number(value).toFixed(2)}`}
                contentStyle={{ borderRadius: 8, fontSize: 12 }}
              />
              {transitionIdx > 0 && (
                <ReferenceLine
                  x={chartData[transitionIdx]?.date}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                />
              )}
              <Area
                type="monotone"
                dataKey="income"
                stroke="#15803d"
                fill="#15803d"
                fillOpacity={0.2}
                name="Income"
              />
              <Area
                type="monotone"
                dataKey="expenses"
                stroke="#e11d48"
                fill="#e11d48"
                fillOpacity={0.2}
                name="Expenses"
              />
            </AreaChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-2">
            {actualCount} days actual · {projectedCount} days scheduled · next 30-day net: {formatCurrency(data.projectedNet30)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

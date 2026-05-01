"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

type Props = {
  summary: {
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
  };
  dailySpending: { date: string; expenses: number; income: number }[];
};

export function MonthlySummary({ summary, velocity, dailySpending }: Props) {
  const netSavings = summary.income - summary.expenses;
  const dailyData = dailySpending.map((d) => ({
    date: new Date(d.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    expenses: d.expenses / 100,
    income: d.income / 100,
  }));

  const donutData = summary.topCategories.map((c) => ({
    name: c.name ?? "Other",
    value: c.total / 100,
    color: c.color ?? "#6b7280",
  }));

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Total Income" value={formatCurrency(summary.income)} />
        <MetricCard label="Total Expenses" value={formatCurrency(summary.expenses)} />
        <MetricCard
          label="Net Savings"
          value={formatCurrency(Math.abs(netSavings))}
          sub={netSavings >= 0 ? "positive" : "negative"}
        />
        <MetricCard
          label="Daily Burn Rate"
          value={formatCurrency(velocity.dailyRate)}
          sub={`${velocity.daysRemaining} days left`}
        />
      </div>

      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Spending by Category Donut */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Spending by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {donutData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                    stroke="none"
                  >
                    {donutData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => `$${Number(value).toFixed(2)}`}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">No spending data</p>
            )}
            <div className="flex flex-wrap gap-3 mt-2">
              {donutData.slice(0, 6).map((c) => (
                <div key={c.name} className="flex items-center gap-1.5 text-xs">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                  {c.name}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Daily Spending Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Daily Spending</CardTitle>
          </CardHeader>
          <CardContent>
            {dailyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(value) => `$${Number(value).toFixed(2)}`} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="expenses" fill="#e11d48" radius={[4, 4, 0, 0]} name="Expenses" />
                  <Bar dataKey="income" fill="#15803d" radius={[4, 4, 0, 0]} name="Income" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">No daily data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Lists */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Top Categories</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.topCategories.map((c, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color ?? "#6b7280" }} />
                  <span className="text-sm">{c.name ?? "Other"}</span>
                  <span className="text-xs text-muted-foreground">({c.count} txns)</span>
                </div>
                <span className="text-sm font-medium">{formatCurrency(c.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Top Merchants</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.topMerchants.map((m, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{m.merchant ?? "Unknown"}</span>
                  <span className="text-xs text-muted-foreground">({m.count}x)</span>
                </div>
                <span className="text-sm font-medium">{formatCurrency(m.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tracking-tight mt-1">{value}</p>
        {sub && (
          <p className={`text-xs mt-1 ${sub === "positive" ? "text-emerald-600" : sub === "negative" ? "text-red-500" : "text-muted-foreground"}`}>
            {sub === "positive" ? "Surplus" : sub === "negative" ? "Deficit" : sub}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

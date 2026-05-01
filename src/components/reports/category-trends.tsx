"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

type Props = {
  data: { month: string; categories: { name: string; total: number; color: string }[] }[];
};

export function CategoryTrends({ data }: Props) {
  // Get current month's categories sorted by amount
  const currentMonth = data[data.length - 1];
  const sortedCategories = currentMonth?.categories
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 12) ?? [];

  const barData = sortedCategories.map((c) => ({
    name: c.name.length > 15 ? c.name.substring(0, 14) + "…" : c.name,
    amount: c.total / 100,
    color: c.color,
  }));

  return (
    <div className="space-y-6">
      {/* Current Month Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            {currentMonth?.month ?? "This Month"} — Spending by Category
          </CardTitle>
        </CardHeader>
        <CardContent>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(300, barData.length * 36)}>
              <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                <Tooltip formatter={(value) => `$${Number(value).toFixed(2)}`} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                  {barData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">No spending data</p>
          )}
        </CardContent>
      </Card>

      {/* Month-over-Month Table */}
      {data.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Month-over-Month Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sortedCategories.map((cat) => {
                const prevMonth = data.length > 1 ? data[data.length - 2] : null;
                const prevAmount = prevMonth?.categories.find((c) => c.name === cat.name)?.total ?? 0;
                const change = cat.total - prevAmount;
                const changePct = prevAmount > 0 ? Math.round((change / prevAmount) * 100) : 0;

                return (
                  <div key={cat.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                      <span className="text-sm">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="font-medium">{formatCurrency(cat.total)}</span>
                      {prevAmount > 0 && (
                        <span className={change > 0 ? "text-red-500" : "text-emerald-600"}>
                          {change > 0 ? "+" : ""}{changePct}%
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {data.length <= 1 && (
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">
              Month-over-month trends will appear as Bud collects more data. Keep syncing to build your financial history.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

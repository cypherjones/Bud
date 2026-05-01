"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

type Props = {
  data: {
    items: { merchant: string | null; amount: number; date: string; categoryName: string | null }[];
    total: number;
    percentage: number;
    annualProjection: number;
    byCategory: { name: string; value: number; color: string }[];
  };
};

export function FrivolousReport({ data }: Props) {
  const donutData = data.byCategory.map((c) => ({ ...c, value: c.value / 100 }));

  return (
    <div className="space-y-6">
      {/* Header Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Frivolous Spending</p>
            <p className="text-2xl font-bold tracking-tight mt-1 text-red-500">{formatCurrency(data.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">% of Total Spending</p>
            <p className="text-2xl font-bold tracking-tight mt-1">{data.percentage}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Annual Projection</p>
            <p className="text-2xl font-bold tracking-tight mt-1 text-red-500">{formatCurrency(data.annualProjection)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Transactions</p>
            <p className="text-2xl font-bold tracking-tight mt-1">{data.items.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Donut + List */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">By Category</CardTitle>
          </CardHeader>
          <CardContent>
            {donutData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={85}
                      dataKey="value"
                      stroke="none"
                    >
                      {donutData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `$${Number(value).toFixed(2)}`} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-3 mt-2">
                  {donutData.map((c) => (
                    <div key={c.name} className="flex items-center gap-1.5 text-xs">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">No frivolous spending found</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Top Frivolous Transactions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.items.slice(0, 12).map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">{item.merchant ?? "Unknown"}</span>
                  <span className="text-xs text-muted-foreground ml-2">{item.categoryName}</span>
                </div>
                <span className="text-sm font-medium text-red-500">{formatCurrency(item.amount)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Actionable Insight */}
      <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800">
        <CardContent className="pt-5">
          <p className="text-sm font-medium">Cutting Frivolous Spending</p>
          <p className="text-sm text-muted-foreground mt-1">
            If you eliminated all frivolous spending, you&apos;d save {formatCurrency(data.total)}/month — that&apos;s {formatCurrency(data.annualProjection)}/year.
            Even cutting 50% would free up {formatCurrency(Math.round(data.total / 2))}/month for debt payoff or savings.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

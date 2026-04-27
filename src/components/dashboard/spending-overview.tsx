"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { formatCurrency } from "@/lib/utils/format";

type CategoryData = { name: string; value: number; color: string };

const EMPTY_DATA = [{ name: "No data", value: 1, color: "#e5e7eb" }];

export function SpendingOverview({ data }: { data: CategoryData[] }) {
  const hasData = data.length > 0;
  const chartData = hasData ? data : EMPTY_DATA;
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">
          Spending by Category
        </CardTitle>
        <span className="text-sm text-muted-foreground">This Month</span>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-8">
          <div className="w-48 h-48 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  dataKey="value"
                  stroke="none"
                >
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                {hasData && <Tooltip formatter={(v) => formatCurrency(Number(v))} />}
              </PieChart>
            </ResponsiveContainer>
            {hasData && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-lg font-bold">{formatCurrency(total)}</div>
                  <div className="text-xs text-muted-foreground">total</div>
                </div>
              </div>
            )}
          </div>
          <div className="flex-1 space-y-2">
            {hasData ? (
              data.slice(0, 5).map((cat) => (
                <div key={cat.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span>{cat.name}</span>
                  </div>
                  <span className="font-medium">{formatCurrency(cat.value)}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Connect your bank to see spending breakdown.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

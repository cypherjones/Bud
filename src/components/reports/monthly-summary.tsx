"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";

type Props = {
  summary: {
    expenses: number;
    income: number;
    prevExpenses: number;
    prevIncome: number;
    isPartialMonth: boolean;
    savingsRate: number;
    topCategories: { name: string | null; color: string | null; total: number; count: number }[];
    topMerchants: { merchant: string | null; total: number; count: number }[];
  };
  velocity: {
    dailyRate: number;
    daysElapsed: number;
    daysRemaining: number;
  };
  // Required monthly savings pace for Houston move — lets net-savings card show
  // "you saved $X vs $Y needed" instead of an unanchored "Surplus / Deficit".
  requiredSavingsPace?: number; // cents
};

export function MonthlySummary({ summary, velocity, requiredSavingsPace }: Props) {
  const netSavings = summary.income - summary.expenses;
  const prevNetSavings = summary.prevIncome - summary.prevExpenses;
  const expensesDelta = summary.prevExpenses > 0
    ? Math.round(((summary.expenses - summary.prevExpenses) / summary.prevExpenses) * 100)
    : null;
  const incomeDelta = summary.prevIncome > 0
    ? Math.round(((summary.income - summary.prevIncome) / summary.prevIncome) * 100)
    : null;
  const savingsGap = requiredSavingsPace !== undefined ? netSavings - requiredSavingsPace : null;

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label={summary.isPartialMonth ? "Income (MTD)" : "Total Income"}
          value={formatCurrency(summary.income)}
          sub={
            incomeDelta !== null
              ? `${incomeDelta >= 0 ? "+" : ""}${incomeDelta}%${summary.isPartialMonth ? " vs same days last mo" : " vs last mo"}`
              : undefined
          }
          subTone={incomeDelta !== null && incomeDelta >= 0 ? "positive" : incomeDelta !== null ? "negative" : "neutral"}
        />
        <MetricCard
          label={summary.isPartialMonth ? "Expenses (MTD)" : "Total Expenses"}
          value={formatCurrency(summary.expenses)}
          sub={
            expensesDelta !== null
              ? `${expensesDelta >= 0 ? "+" : ""}${expensesDelta}%${summary.isPartialMonth ? " vs same days last mo" : " vs last mo"}`
              : undefined
          }
          // For expenses, lower is better — invert tone.
          subTone={expensesDelta !== null && expensesDelta <= 0 ? "positive" : expensesDelta !== null ? "negative" : "neutral"}
        />
        <MetricCard
          label="Net Savings"
          value={formatCurrency(Math.abs(netSavings))}
          sub={
            requiredSavingsPace !== undefined
              ? savingsGap !== null && savingsGap >= 0
                ? `+${formatCurrency(savingsGap)} above move pace`
                : savingsGap !== null
                  ? `${formatCurrency(Math.abs(savingsGap))} short of move pace`
                  : netSavings >= 0
                    ? "Surplus"
                    : "Deficit"
              : netSavings >= 0
                ? "Surplus"
                : "Deficit"
          }
          subTone={
            requiredSavingsPace !== undefined && savingsGap !== null
              ? savingsGap >= 0
                ? "positive"
                : "negative"
              : netSavings >= 0
                ? "positive"
                : "negative"
          }
        />
        <MetricCard
          label="Daily Burn Rate"
          value={formatCurrency(velocity.dailyRate)}
          sub={`${velocity.daysRemaining} days left`}
        />
      </div>

      {/* Goal alignment strip */}
      {requiredSavingsPace !== undefined && (
        <Card className={savingsGap !== null && savingsGap >= 0 ? "border-emerald-200 dark:border-emerald-800" : "border-amber-200 dark:border-amber-800"}>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Move savings pace check</p>
            <p className="text-sm mt-1">
              <span className="font-medium">{formatCurrency(netSavings)}</span> netted this month vs{" "}
              <span className="font-medium">{formatCurrency(requiredSavingsPace)}/mo</span> needed to hit Houston target.{" "}
              {savingsGap !== null && savingsGap >= 0 ? (
                <span className="text-emerald-600 dark:text-emerald-400">On pace.</span>
              ) : savingsGap !== null ? (
                <span className="text-amber-600 dark:text-amber-400">
                  Behind by {formatCurrency(Math.abs(savingsGap))}.
                </span>
              ) : null}
              {prevNetSavings !== 0 && (
                <span className="text-muted-foreground"> · last month: {formatCurrency(prevNetSavings)} net.</span>
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Last Full Month context — early in the month MTD looks tiny on its own;
          showing the prior full month gives a real anchor so the user isn't
          looking at "$504 / $3,499" without knowing what a typical month is. */}
      {summary.isPartialMonth && (summary.prevIncome > 0 || summary.prevExpenses > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Same window, last month</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              First {velocity.daysElapsed} day{velocity.daysElapsed !== 1 ? "s" : ""} of the prior
              month — anchors what your MTD numbers should look like by now.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Income</p>
                <p className="text-lg font-semibold mt-0.5">{formatCurrency(summary.prevIncome)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Expenses</p>
                <p className="text-lg font-semibold mt-0.5">{formatCurrency(summary.prevExpenses)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Net</p>
                <p className={`text-lg font-semibold mt-0.5 ${prevNetSavings >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {prevNetSavings >= 0 ? "" : "-"}{formatCurrency(Math.abs(prevNetSavings))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Categories + Top Merchants side by side */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Top Categories {summary.isPartialMonth ? "(MTD)" : ""}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.topCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No category data yet.</p>
            ) : (
              summary.topCategories.slice(0, 8).map((c, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-1.5 border-b border-border last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: c.color ?? "#6b7280" }}
                    />
                    <span className="text-sm truncate">{c.name ?? "Uncategorized"}</span>
                    <span className="text-xs text-muted-foreground shrink-0">({c.count}x)</span>
                  </div>
                  <span className="text-sm font-medium shrink-0">{formatCurrency(c.total)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Top Merchants {summary.isPartialMonth ? "(MTD)" : ""}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Normalized — same merchant under different bank-formatted descriptions collapsed.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.topMerchants.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No merchant data yet.</p>
            ) : (
              summary.topMerchants.map((m, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-1.5 border-b border-border last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm truncate">{m.merchant ?? "Unknown"}</span>
                    <span className="text-xs text-muted-foreground shrink-0">({m.count}x)</span>
                  </div>
                  <span className="text-sm font-medium shrink-0">{formatCurrency(m.total)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  subTone,
}: {
  label: string;
  value: string;
  sub?: string;
  subTone?: "positive" | "negative" | "neutral";
}) {
  const toneClass =
    subTone === "positive"
      ? "text-emerald-600"
      : subTone === "negative"
        ? "text-red-500"
        : "text-muted-foreground";
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tracking-tight mt-1">{value}</p>
        {sub && <p className={`text-xs mt-1 ${toneClass}`}>{sub}</p>}
      </CardContent>
    </Card>
  );
}

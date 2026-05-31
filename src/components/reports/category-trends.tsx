"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, ExternalLink } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type Props = {
  data: {
    month: string;
    categories: { id: string | null; name: string; total: number; color: string }[];
    isPartial: boolean;
    daysCovered: number;
    daysInMonth: number;
  }[];
};

const TREND_FLAG_THRESHOLD = 0.2; // 20% MoM increase flagged as concerning

function trendForCategory(
  monthly: { month: string; total: number }[],
): {
  direction: "up" | "down" | "flat" | "new" | "ended";
  pctChange: number; // last vs prior month, signed; 0 when prior was 0 (handled by direction)
  avgPctChange: number; // average of MoM deltas across the window
} {
  if (monthly.length < 2) return { direction: "flat", pctChange: 0, avgPctChange: 0 };
  const last = monthly[monthly.length - 1].total;
  const prev = monthly[monthly.length - 2].total;
  let direction: "up" | "down" | "flat" | "new" | "ended" = "flat";
  let pctChange = 0;
  if (prev === 0 && last > 0) direction = "new";
  else if (prev > 0 && last === 0) direction = "ended";
  else if (prev > 0) {
    pctChange = (last - prev) / prev;
    if (pctChange > 0.05) direction = "up";
    else if (pctChange < -0.05) direction = "down";
    else direction = "flat";
  }
  // Average MoM trend across all observed pairs (skip 0→x to avoid noise)
  let avgSum = 0;
  let avgCount = 0;
  for (let i = 1; i < monthly.length; i++) {
    const a = monthly[i - 1].total;
    const b = monthly[i].total;
    if (a > 0) {
      avgSum += (b - a) / a;
      avgCount++;
    }
  }
  const avgPctChange = avgCount > 0 ? avgSum / avgCount : 0;
  return { direction, pctChange, avgPctChange };
}

export function CategoryTrends({ data }: Props) {
  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="pt-5">
          <p className="text-sm text-muted-foreground text-center py-12">No spending data</p>
        </CardContent>
      </Card>
    );
  }

  const partialIdx = data.findIndex((m) => m.isPartial);
  const latestPartial = partialIdx === data.length - 1 ? data[partialIdx] : null;
  // Use the most recent COMPLETE month for top-5 picks and MoM comparisons.
  // The partial-month entry stays on the chart but is marked separately so
  // we don't draw misleading drops or new-category flags from a 4-day window.
  const lastCompleteIdx = latestPartial ? data.length - 2 : data.length - 1;
  const lastCompleteMonth = lastCompleteIdx >= 0 ? data[lastCompleteIdx] : data[data.length - 1];

  // Build a unified set of category names across all months, with their
  // colors and ids — ids are used for clickable links into /transactions.
  const colorByName = new Map<string, string>();
  const idByName = new Map<string, string | null>();
  for (const m of data) {
    for (const c of m.categories) {
      if (!colorByName.has(c.name) && c.color) colorByName.set(c.name, c.color);
      if (!idByName.has(c.name)) idByName.set(c.name, c.id);
    }
  }

  // Top 5 by the last *complete* month — partial months are too noisy.
  const top5Names = lastCompleteMonth.categories
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map((c) => c.name);

  // Per-category time series across the full window (used by trend
  // computation below — partial month skipped from MoM comparison).
  const seriesByCategory = new Map<string, { month: string; total: number; isPartial: boolean }[]>();
  for (const name of colorByName.keys()) {
    seriesByCategory.set(
      name,
      data.map((m) => ({
        month: m.month,
        total: m.categories.find((c) => c.name === name)?.total ?? 0,
        isPartial: m.isPartial,
      })),
    );
  }

  // Chart data: each month is its actual total. Partial-month entries get
  // annotated in the legend (label suffix + tooltip) so the line dropping at
  // the end is understood as "MTD only" not as a real spending decline.
  const chartData = data.map((m) => {
    const row: Record<string, string | number> = {
      month: m.isPartial ? `${m.month} (MTD)` : m.month,
    };
    for (const name of top5Names) {
      const value = m.categories.find((c) => c.name === name)?.total ?? 0;
      row[name] = Math.round(value / 100);
    }
    return row;
  });

  // Compute trend per category for the table (not just top-5).
  type Row = {
    name: string;
    color: string;
    latest: number;
    prior: number;
    pctChange: number;
    avgPctChange: number;
    direction: ReturnType<typeof trendForCategory>["direction"];
    flagged: boolean;
  };
  // For MoM comparison, drop the partial-month entry from the series so the
  // "Trending Up" auto-flag doesn't fire (or hide) based on calendar bias.
  const completeOnly = (s: { month: string; total: number; isPartial: boolean }[]) =>
    s.filter((m) => !m.isPartial);

  const rows: Row[] = [];
  for (const [name, series] of seriesByCategory.entries()) {
    const completeSeries = completeOnly(series);
    if (completeSeries.length === 0) continue;
    const latest = completeSeries[completeSeries.length - 1].total;
    const prior = completeSeries.length > 1 ? completeSeries[completeSeries.length - 2].total : 0;
    if (latest === 0 && prior === 0) continue;
    const t = trendForCategory(completeSeries);
    const flagged =
      (t.direction === "up" && t.pctChange >= TREND_FLAG_THRESHOLD) ||
      (t.direction === "new" && latest >= 5000); // $50+ new category is worth knowing about
    rows.push({
      name,
      color: colorByName.get(name) ?? "#6b7280",
      latest,
      prior,
      pctChange: t.pctChange,
      avgPctChange: t.avgPctChange,
      direction: t.direction,
      flagged,
    });
  }
  rows.sort((a, b) => b.latest - a.latest);

  const flaggedRows = rows.filter((r) => r.flagged);

  return (
    <div className="space-y-6">
      {/* Multi-line trend chart for top 5 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Top 5 Categories — {data.length}-Month Trend
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Tracks the categories that dominate your most recent <em>complete</em> month. Lines diverging up = problem
            categories; lines trending down = working cuts.
            {latestPartial && (
              <>
                {" "}The final point is <strong>{latestPartial.daysCovered} of {latestPartial.daysInMonth} days</strong> —
                month-to-date only, not a full month.
              </>
            )}
          </p>
        </CardHeader>
        <CardContent>
          {chartData.length >= 2 ? (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  formatter={(value, name) => [`$${Number(value).toLocaleString()}`, name as string]}
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {top5Names.map((name) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={colorByName.get(name) ?? "#6b7280"}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">
              Need at least 2 months of data for a trend line.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Auto-flagged categories */}
      {flaggedRows.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Trending Up
              <span className="text-xs font-normal text-muted-foreground">
                · {flaggedRows.length} categor{flaggedRows.length !== 1 ? "ies" : "y"} need attention
              </span>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Categories that grew &gt;20% MoM, or new categories with meaningful spend.
              Click a category to see the transactions; cut suggestions show how much would free up.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {flaggedRows.map((r) => {
              const id = idByName.get(r.name);
              const cut20 = Math.round(r.latest * 0.2);
              const cut50 = Math.round(r.latest * 0.5);
              return (
                <div key={r.name} className="space-y-1.5 pb-3 border-b border-border last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                      {id ? (
                        <Link
                          href={`/transactions?category=${id}`}
                          className="text-sm font-medium truncate hover:underline inline-flex items-center gap-1"
                        >
                          {r.name}
                          <ExternalLink className="w-3 h-3 opacity-50" />
                        </Link>
                      ) : (
                        <span className="text-sm font-medium truncate">{r.name}</span>
                      )}
                      {r.direction === "new" && (
                        <Badge variant="outline" className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-[9px]">
                          NEW
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm shrink-0">
                      <span className="text-muted-foreground text-xs">
                        {formatCurrency(r.prior)} → {formatCurrency(r.latest)}
                      </span>
                      <span className="font-semibold text-amber-500 min-w-[50px] text-right">
                        {r.direction === "new" ? "new" : `+${Math.round(r.pctChange * 100)}%`}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground pl-4">
                    Cut 20% → <span className="text-emerald-500 font-medium">{formatCurrency(cut20)}/mo</span> back ·
                    Cut 50% → <span className="text-emerald-500 font-medium">{formatCurrency(cut50)}/mo</span> back
                    {" "}toward debt or move savings
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Full MoM table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">All Categories — Month-over-Month</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {rows.map((r) => {
              const Icon =
                r.direction === "up"
                  ? TrendingUp
                  : r.direction === "down"
                    ? TrendingDown
                    : r.direction === "new"
                      ? TrendingUp
                      : r.direction === "ended"
                        ? TrendingDown
                        : Minus;
              const tone =
                r.direction === "up"
                  ? "text-red-500"
                  : r.direction === "down"
                    ? "text-emerald-500"
                    : r.direction === "new"
                      ? "text-blue-500"
                      : r.direction === "ended"
                        ? "text-emerald-500"
                        : "text-muted-foreground";
              const id = idByName.get(r.name);
              return (
                <div key={r.name} className="flex items-center justify-between gap-3 py-1.5 border-b border-border last:border-0">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                    {id ? (
                      <Link
                        href={`/transactions?category=${id}`}
                        className="text-sm truncate hover:underline"
                      >
                        {r.name}
                      </Link>
                    ) : (
                      <span className="text-sm truncate">{r.name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm shrink-0">
                    <span className="font-medium min-w-[80px] text-right">{formatCurrency(r.latest)}</span>
                    <span className={`flex items-center gap-1 ${tone} min-w-[70px] justify-end text-xs`}>
                      <Icon className="w-3 h-3" />
                      {r.direction === "new"
                        ? "new"
                        : r.direction === "ended"
                          ? "ended"
                          : r.prior > 0
                            ? `${r.pctChange > 0 ? "+" : ""}${Math.round(r.pctChange * 100)}%`
                            : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

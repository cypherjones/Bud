"use client";

import Link from "next/link";
import { SectionHead } from "@/components/plan/plan-ui";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
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
    return <p className="text-sm text-muted-foreground">No spending yet.</p>;
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
  // "Oct 2026" → "October"; the comparison months the table and flags use.
  const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fullMonth = (label: string) => {
    const i = SHORT.indexOf(label.split(" ")[0]);
    return i < 0 ? label : new Date(2000, i, 1).toLocaleDateString("en-US", { month: "long" });
  };
  const latestName = fullMonth(lastCompleteMonth.month);
  const priorName = lastCompleteIdx >= 1 ? fullMonth(data[lastCompleteIdx - 1].month) : null;
  const versus = priorName ? `${latestName} against ${priorName}` : latestName;

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <SectionHead
          title="The five biggest, month by month"
          sub={
            <>
              Picked from {latestName}, the last full month.
              {latestPartial && ` The last point is ${latestPartial.month} so far: ${latestPartial.daysCovered} of ${latestPartial.daysInMonth} days.`}
            </>
          }
        />
        {chartData.length >= 2 ? (
          <div className="rounded-xl border border-border bg-card px-2 pt-4 pb-2">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ left: -8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} tickFormatter={(m: string) => m.split(" ")[0]} />
                <YAxis tick={{ fontSize: 10 }} width={52} tickFormatter={(v) => `$${Number(v).toLocaleString()}`} />
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
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">A trend needs at least two months.</p>
        )}
      </section>

      {flaggedRows.length > 0 && (
        <section className="space-y-3">
          <SectionHead
            title="Going up"
            sub={`${versus}: up more than 20%, or new with $50 or more. Tap one to see the purchases.`}
          />
          <ul className="divide-y divide-border rounded-xl border border-amber-500/30 bg-amber-500/5">
            {flaggedRows.map((r) => {
              const id = idByName.get(r.name);
              return (
                <li key={r.name} className="px-4 py-2.5 text-sm">
                  <div className="flex items-baseline gap-3">
                    <span className="w-2 h-2 rounded-full shrink-0 self-center" style={{ backgroundColor: r.color }} />
                    {id ? (
                      <Link href={`/transactions?category=${id}`} className="flex-1 min-w-0 truncate font-medium hover:underline">
                        {r.name}
                      </Link>
                    ) : (
                      <span className="flex-1 min-w-0 truncate font-medium">{r.name}</span>
                    )}
                    <span className="font-mono tabular-nums whitespace-nowrap">{formatCurrency(r.latest)}</span>
                    <span className="w-12 text-right text-xs font-semibold text-amber-500">
                      {r.direction === "new" ? "new" : `+${Math.round(r.pctChange * 100)}%`}
                    </span>
                  </div>
                  <p className="mt-0.5 pl-5 text-xs text-muted-foreground">
                    {r.direction === "new" ? `nothing in ${priorName ?? "the month before"}` : `was ${formatCurrency(r.prior)}`}
                    {" · "}half of it is {formatCurrency(Math.round(r.latest * 0.5))} a month
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <SectionHead title="Every category" sub={`${versus}.`} />
        <ul className="divide-y divide-border text-sm">
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
                  ? "text-red-400"
                  : r.direction === "down"
                    ? "text-emerald-400"
                    : r.direction === "new"
                      ? "text-amber-400"
                      : r.direction === "ended"
                        ? "text-emerald-400"
                        : "text-muted-foreground";
              const id = idByName.get(r.name);
              return (
                <li key={r.name} className="flex items-center gap-3 py-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                  {id ? (
                    <Link href={`/transactions?category=${id}`} className="flex-1 min-w-0 truncate hover:underline">
                      {r.name}
                    </Link>
                  ) : (
                    <span className="flex-1 min-w-0 truncate">{r.name}</span>
                  )}
                  <span className="font-mono tabular-nums whitespace-nowrap">{formatCurrency(r.latest)}</span>
                  <span className={`flex w-16 items-center justify-end gap-1 text-xs ${tone}`}>
                    <Icon className="w-3 h-3" />
                    {r.direction === "new"
                      ? "new"
                      : r.direction === "ended"
                        ? "ended"
                        : r.prior > 0
                          ? `${r.pctChange > 0 ? "+" : ""}${Math.round(r.pctChange * 100)}%`
                          : "—"}
                  </span>
                </li>
              );
            })}
        </ul>
      </section>
    </div>
  );
}

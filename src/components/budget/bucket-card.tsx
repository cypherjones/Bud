"use client";

import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import { ChevronDown } from "lucide-react";
import type { AllocationBucket } from "@/lib/actions/budget";

type Props = {
  bucket: AllocationBucket;
  meta: { label: string; sublabel: string; color: string; icon: React.ReactNode };
  totalIncome: number;
  daysElapsed: number;
  daysInMonth: number;
  killListSavings?: number;
};

/** Clickable bucket summary. Click → scrolls to and pulses the matching
 *  bucket section in the BudgetTable below. Hover → shows top-3 categories
 *  driving the bucket via pure CSS group-hover (no JS state, more reliable
 *  than mouseEnter/Leave handlers when tooltip lives outside the parent
 *  bounding box). */
export function BucketCard({ bucket, meta, totalIncome, daysElapsed, daysInMonth, killListSavings }: Props) {
  // Calendar-month framing: headline is MTD spend, secondary is EOM-pace
  // projection. The user mental model is "this is what I've done this month
  // vs what I planned" — same frame as every standard budget app, plus our
  // pace-projection layered on top so they see where they're heading.
  const pct = totalIncome > 0 ? Math.round((bucket.mtdCents / totalIncome) * 100) : 0;
  const showKillImpact = killListSavings && killListSavings > 0 && bucket.key === "operational";
  const projectedAfterKill = showKillImpact ? bucket.projectedCents - killListSavings : null;

  const showPlan = bucket.hasBudgetCoverage;
  // Compare projected EOM (MTD-pace × days_in_month) vs PLAN (sum of budgets).
  // Plan delta still uses projected because the user wants "am I going to
  // blow my budget at this pace" — a forward-looking pace question.
  const planDelta = bucket.projectedCents - bucket.plannedCents;
  const overPlan = planDelta > 1000;

  // Top 3 categories driving this bucket (for hover tooltip).
  const top3 = [...bucket.categories]
    .filter((c) => c.cents > 0)
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 3);

  const handleClick = () => {
    const targetId = `bucket-section-${bucket.key}`;
    if (window.location.hash === `#${targetId}`) {
      window.location.hash = "";
    }
    window.location.hash = targetId;
    setTimeout(() => {
      const el = document.getElementById(targetId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 30);
  };

  const handleKillImpactClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const queue = document.getElementById("action-queue");
    if (queue) queue.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Keyboard handler so a div-with-role=button still feels like a real button.
  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div className="relative group">
      {/* Outer is a clickable DIV (not <button>) so the inner kill-impact
          <button> is legal HTML. Nested buttons trigger a hydration error. */}
      <div
        onClick={handleClick}
        onKeyDown={handleKey}
        role="button"
        tabIndex={0}
        aria-label={`Jump to ${meta.label} section in budget table`}
        className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
      >
        <Card className="group-hover:border-foreground/30 group-hover:shadow-md transition-all cursor-pointer">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5" style={{ color: meta.color }}>
                {meta.icon}
                <p className="text-xs font-medium">{meta.label}</p>
              </div>
              <ChevronDown className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
            </div>
            <p className="text-xl font-bold tabular-nums">{formatCurrency(bucket.mtdCents)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              spent · day {daysElapsed} of {daysInMonth} · {pct}% of income
            </p>
            {showPlan && (
              <p className={`text-[10px] mt-1 tabular-nums ${overPlan ? "text-red-500" : "text-emerald-600"}`}>
                Plan {formatCurrency(bucket.plannedCents)} · pace {formatCurrency(bucket.projectedCents)} EOM
                {overPlan && ` (over ${formatCurrency(planDelta)})`}
                {!overPlan && Math.abs(planDelta) > 1000 && ` (on track)`}
              </p>
            )}
            {!showPlan && (
              <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                Pace {formatCurrency(bucket.projectedCents)} EOM
              </p>
            )}
            {showKillImpact && projectedAfterKill !== null && (
              <button
                onClick={handleKillImpactClick}
                className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 hover:underline decoration-dotted underline-offset-2 text-left w-full"
                aria-label="Jump to kill list actions"
              >
                → {formatCurrency(projectedAfterKill)} if kill list executed
              </button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Hover tooltip: pure CSS via group-hover. Positioned ABOVE the card
          (bottom-full mb-1) instead of below — the parent shadcn Card has
          overflow-hidden which clipped a below-positioned tooltip. */}
      {top3.length > 0 && (
        <div
          className="absolute z-50 left-0 right-0 bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none"
        >
          <div
            className="bg-popover border border-border rounded-md shadow-xl p-2.5 text-[11px] space-y-1.5"
            style={{ borderBottomWidth: "2px", borderBottomColor: meta.color }}
          >
            <div className="flex items-baseline justify-between gap-2 pb-1.5 border-b border-border/60">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
                Top {top3.length} in {meta.label.toLowerCase()}
              </p>
              <p className="text-[9px] text-muted-foreground italic">click card to drill in</p>
            </div>
            {top3.map((cat) => (
              <div key={cat.categoryId} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cat.color ?? "#6b7280" }} />
                  <span className="truncate">{cat.name}</span>
                </div>
                <span className="font-medium tabular-nums shrink-0">{formatCurrency(cat.cents)}</span>
              </div>
            ))}
            {bucket.categories.length > 3 && (
              <p className="text-[10px] text-muted-foreground pt-1 border-t border-border/60">
                +{bucket.categories.length - 3} more · in budget table below
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/utils/format";
import { AlertTriangle, ShieldCheck, TrendingUp, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { BudgetStrategy, ActionItem } from "@/lib/actions/budget";

type Props = {
  strategy: BudgetStrategy;
  topActions: ActionItem[]; // first 3 from action queue
};

const PHASE_STYLES = {
  stop_bleed: {
    border: "border-red-300 dark:border-red-900",
    bg: "bg-red-50/40 dark:bg-red-950/20",
    icon: <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />,
  },
  build_buffer: {
    border: "border-amber-300 dark:border-amber-800",
    bg: "bg-amber-50/40 dark:bg-amber-950/20",
    icon: <ShieldCheck className="w-5 h-5 text-amber-700 dark:text-amber-400" />,
  },
  save: {
    border: "border-emerald-300 dark:border-emerald-800",
    bg: "bg-emerald-50/40 dark:bg-emerald-950/20",
    icon: <TrendingUp className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />,
  },
} as const;

/** Dashboard hero — splits "long-term trajectory" from "what's about to happen
 *  this month" so the two never get conflated in the same row. The phase + the
 *  steady-state cycle live on one line; today's balance walking to end-of-month
 *  lives on its own line. Each action below links back to /budget.
 */
export function StrategicHero({ strategy, topActions }: Props) {
  const style = PHASE_STYLES[strategy.phase];
  const monthlyNet = strategy.projectedNextMonthNet;
  const restNet = strategy.projectedRestOfMonthNet;
  const positive = monthlyNet >= 0;

  let progressValue = 0;
  let longTermDetail = "";
  if (strategy.phase === "stop_bleed") {
    longTermDetail = `Normal month: ${monthlyNet >= 0 ? "+" : "−"}${formatCurrency(Math.abs(monthlyNet))} · cuts needed to flip positive`;
  } else if (strategy.phase === "build_buffer") {
    progressValue = strategy.bufferPercent;
    const eta = strategy.bufferEtaMonths;
    const etaText = eta === null ? "no surplus yet" : eta === 0 ? "✓ funded" : `~${eta} mo at +${formatCurrency(monthlyNet)}/mo`;
    longTermDetail = `Normal month: ${positive ? "+" : "−"}${formatCurrency(Math.abs(monthlyNet))} · Buffer ${strategy.bufferPercent}% (${etaText})`;
  } else {
    progressValue = strategy.moveTargetCents > 0
      ? Math.min(100, Math.round((strategy.moveSavedCents / strategy.moveTargetCents) * 100))
      : 0;
    longTermDetail = `Normal month: ${positive ? "+" : "−"}${formatCurrency(Math.abs(monthlyNet))} · Houston ${formatCurrency(strategy.moveSavedCents)} of ${formatCurrency(strategy.moveTargetCents)} (${progressValue}%)`;
  }

  const endOfMonthLabel = new Date(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    0,
  ).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <Card className={`${style.border} ${style.bg}`}>
      <CardContent className="py-4 px-5">
        <div className="flex items-start gap-4 mb-4">
          <div className="shrink-0 mt-0.5">{style.icon}</div>
          <div className="flex-1 min-w-0 space-y-2.5">
            {/* Phase + open link */}
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <p className="text-sm font-semibold tracking-tight">{strategy.phaseLabel}</p>
              <Link href="/budget" className="text-xs text-muted-foreground hover:text-foreground underline decoration-dotted underline-offset-2">
                Open /budget →
              </Link>
            </div>

            {/* Long-term: steady-state cycle + goal progress */}
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Long-term</p>
              <p className="text-xs tabular-nums">{longTermDetail}</p>
              {strategy.phase !== "stop_bleed" && (
                <Progress value={progressValue} className="h-1.5" />
              )}
            </div>

            {/* This month: today → EOM cash walk */}
            <div className="space-y-1 pt-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">This month</p>
              <div className="flex items-baseline gap-2 flex-wrap tabular-nums">
                <span className="text-xs text-muted-foreground">Today</span>
                <span className="text-sm font-semibold">{formatCurrency(strategy.todayBalanceCents)}</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{endOfMonthLabel}</span>
                <span className="text-sm font-semibold">{formatCurrency(strategy.projectedEomBalanceCents)}</span>
                <span className={`text-xs font-medium ${restNet >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  ({restNet >= 0 ? "+" : "−"}{formatCurrency(Math.abs(restNet))} from scheduled bills)
                </span>
              </div>
            </div>
          </div>
        </div>

        {topActions.length > 0 && (
          <div className="pt-3 border-t border-border/60">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium">Top 3 actions this week</p>
              <Link href="/plan/open#action-queue" className="text-xs text-muted-foreground hover:text-foreground">
                See all →
              </Link>
            </div>
            <div className="space-y-1">
              {topActions.slice(0, 3).map((action) => (
                <Link
                  key={action.id}
                  href={action.ctaType === "link" ? action.ctaTarget : "/budget#action-queue"}
                  className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-background/50 transition-colors"
                >
                  {action.categoryColor ? (
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: action.categoryColor }} />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-muted-foreground/40" />
                  )}
                  <p className="text-sm font-medium truncate flex-1">{action.title}</p>
                  {action.monthlyImpact > 0 && (
                    <span className="text-xs font-semibold tabular-nums text-emerald-600 shrink-0">
                      {formatCurrency(action.monthlyImpact)}/mo
                    </span>
                  )}
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

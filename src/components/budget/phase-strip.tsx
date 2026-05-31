import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/utils/format";
import { AlertTriangle, ShieldCheck, TrendingUp } from "lucide-react";
import type { BudgetStrategy } from "@/lib/actions/budget";

type Props = {
  strategy: BudgetStrategy;
};

const PHASE_STYLES = {
  stop_bleed: {
    border: "border-red-300 dark:border-red-900",
    bg: "bg-red-50/40 dark:bg-red-950/20",
    icon: <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />,
  },
  build_buffer: {
    border: "border-amber-300 dark:border-amber-800",
    bg: "bg-amber-50/40 dark:bg-amber-950/20",
    icon: <ShieldCheck className="w-4 h-4 text-amber-700 dark:text-amber-400" />,
  },
  save: {
    border: "border-emerald-300 dark:border-emerald-800",
    bg: "bg-emerald-50/40 dark:bg-emerald-950/20",
    icon: <TrendingUp className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />,
  },
} as const;

/** Phase banner. Same long-term / this-month split as StrategicHero on
 *  /dashboard — putting steady-state monthly net next to rest-of-month
 *  cash change in one row reads as a contradiction (the prior version did),
 *  so they live on separate rows now. */
export function PhaseStrip({ strategy }: Props) {
  const style = PHASE_STYLES[strategy.phase];
  const monthlyNet = strategy.projectedNextMonthNet;
  const restNet = strategy.projectedRestOfMonthNet;
  const monthlyNetPositive = monthlyNet >= 0;

  let progressValue = 0;
  let longTermDetail = "";
  if (strategy.phase === "stop_bleed") {
    progressValue = 0;
    longTermDetail = `Normal month: ${monthlyNetPositive ? "+" : "−"}${formatCurrency(Math.abs(monthlyNet))} · cuts needed to flip positive`;
  } else if (strategy.phase === "build_buffer") {
    progressValue = strategy.bufferPercent;
    longTermDetail = `Normal month: ${monthlyNetPositive ? "+" : "−"}${formatCurrency(Math.abs(monthlyNet))} · Buffer ${strategy.bufferPercent}% funded`;
  } else {
    progressValue = strategy.moveTargetCents > 0
      ? Math.min(100, Math.round((strategy.moveSavedCents / strategy.moveTargetCents) * 100))
      : 0;
    longTermDetail = `Normal month: ${monthlyNetPositive ? "+" : "−"}${formatCurrency(Math.abs(monthlyNet))} · Houston ${formatCurrency(strategy.moveSavedCents)} of ${formatCurrency(strategy.moveTargetCents)} (${progressValue}%)`;
  }

  const endOfMonthLabel = new Date(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    0,
  ).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const showThinDataNote = strategy.projectionConfidence === "thin" && strategy.phase === "stop_bleed";

  return (
    <Card className={`${style.border} ${style.bg}`}>
      <CardContent className="py-3 px-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5">{style.icon}</div>
          <div className="flex-1 min-w-0 space-y-2">
            <p className="text-sm font-semibold tracking-tight">{strategy.phaseLabel}</p>

            {/* Long-term: steady-state cycle + goal progress */}
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Long-term</p>
              <p className="text-xs tabular-nums">{longTermDetail}</p>
              <Progress value={progressValue} className="h-1.5" />
            </div>

            {/* This month: today → EOM cash walk */}
            <div className="space-y-1 pt-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">This month</p>
              <div className="flex items-baseline gap-2 flex-wrap tabular-nums">
                <span className="text-xs text-muted-foreground">Today</span>
                <span className="text-sm font-semibold">{formatCurrency(strategy.todayBalanceCents)}</span>
                <span className="text-muted-foreground">→</span>
                <span className="text-xs text-muted-foreground">{endOfMonthLabel}</span>
                <span className="text-sm font-semibold">{formatCurrency(strategy.projectedEomBalanceCents)}</span>
                <span className={`text-xs font-medium ${restNet >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  ({restNet >= 0 ? "+" : "−"}{formatCurrency(Math.abs(restNet))} from scheduled bills)
                </span>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground pt-1">
              {strategy.phaseDetail}
              {showThinDataNote && (
                <span className="text-amber-600 dark:text-amber-400">
                  {" · "}Day {strategy.daysElapsedThisMonth} of {strategy.daysInThisMonth} — projection thin until ~day 7
                </span>
              )}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

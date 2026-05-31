import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/utils/format";
import { AlertTriangle, ShieldCheck, TrendingUp } from "lucide-react";
import type { BudgetStrategy } from "@/lib/actions/budget";

type Props = {
  strategy: BudgetStrategy;
};

export function PhaseBanner({ strategy }: Props) {
  const phaseStyles = {
    stop_bleed: {
      border: "border-red-300 dark:border-red-900",
      bg: "bg-red-50/40 dark:bg-red-950/20",
      iconBg: "bg-red-100 dark:bg-red-950/50",
      iconColor: "text-red-600 dark:text-red-400",
      icon: <AlertTriangle className="w-5 h-5" />,
      progressLabel: "Surplus",
    },
    build_buffer: {
      border: "border-amber-300 dark:border-amber-800",
      bg: "bg-amber-50/40 dark:bg-amber-950/20",
      iconBg: "bg-amber-100 dark:bg-amber-950/50",
      iconColor: "text-amber-700 dark:text-amber-400",
      icon: <ShieldCheck className="w-5 h-5" />,
      progressLabel: "Buffer Progress",
    },
    save: {
      border: "border-emerald-300 dark:border-emerald-800",
      bg: "bg-emerald-50/40 dark:bg-emerald-950/20",
      iconBg: "bg-emerald-100 dark:bg-emerald-950/50",
      iconColor: "text-emerald-700 dark:text-emerald-400",
      icon: <TrendingUp className="w-5 h-5" />,
      progressLabel: "Houston Progress",
    },
  };

  const style = phaseStyles[strategy.phase];

  // Progress bar contents differ by phase — surplus track-to-zero, buffer fill,
  // or Houston fill respectively.
  let progressValue = 0;
  let progressDetail = "";
  if (strategy.phase === "stop_bleed") {
    // Show how close they are to break-even (0% deficit = 100% bar)
    const deficit = Math.abs(strategy.surplusMonthly);
    progressValue = 0;
    progressDetail = `${formatCurrency(deficit)} deficit/mo · cut to break even before saving`;
  } else if (strategy.phase === "build_buffer") {
    progressValue = strategy.bufferPercent;
    const eta = strategy.bufferEtaMonths;
    progressDetail = `${formatCurrency(strategy.bufferCurrentCents)} of ${formatCurrency(strategy.bufferTargetCents)} · ${
      eta === null ? "no surplus yet" : eta === 0 ? "fully funded" : `~${eta} mo at current pace`
    }`;
  } else {
    progressValue = strategy.moveTargetCents > 0
      ? Math.min(100, Math.round((strategy.moveSavedCents / strategy.moveTargetCents) * 100))
      : 0;
    progressDetail = `${formatCurrency(strategy.moveSavedCents)} of ${formatCurrency(strategy.moveTargetCents)} for Houston · ${formatCurrency(strategy.moveRequiredPaceCents)}/mo needed`;
  }

  return (
    <Card className={`${style.border} ${style.bg}`}>
      <CardContent className="py-4 px-5">
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-lg ${style.iconBg} ${style.iconColor} flex items-center justify-center shrink-0`}>
            {style.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold tracking-tight">{strategy.phaseLabel}</h2>
              <span className="text-xs text-muted-foreground shrink-0">{style.progressLabel}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{strategy.phaseDetail}</p>
            <div className="mt-3 space-y-1.5">
              <Progress value={progressValue} className="h-2" />
              <p className="text-xs text-muted-foreground">{progressDetail}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

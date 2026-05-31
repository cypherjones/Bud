"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/utils/format";
import { apiFetch } from "@/lib/client/api";
import { useRouter } from "next/navigation";
import { AlertTriangle, ShieldCheck, TrendingUp, ArrowRight } from "lucide-react";
import type { BudgetStrategy, ActionItem } from "@/lib/actions/budget";

type Props = {
  strategy: BudgetStrategy;
  topActions: ActionItem[]; // first 3 from action queue
};

const PHASE_STYLES = {
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
} as const;

export function ActionOfTheWeekCard({ strategy, topActions }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const router = useRouter();
  const style = PHASE_STYLES[strategy.phase];

  // Progress contents per phase
  let progressValue = 0;
  let progressDetail = "";
  if (strategy.phase === "stop_bleed") {
    progressValue = 0;
    progressDetail = `${formatCurrency(Math.abs(strategy.surplusMonthly))} actual deficit · plan would yield ${strategy.plannedSurplus >= 0 ? "+" : "−"}${formatCurrency(Math.abs(strategy.plannedSurplus))} if honored`;
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

  const handleCta = async (action: ActionItem) => {
    setBusyId(action.id);
    try {
      switch (action.ctaType) {
        case "scroll": {
          const el = document.getElementById(action.ctaTarget);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          break;
        }
        case "link":
          router.push(action.ctaTarget);
          break;
        case "tag":
          if (action.kind === "kill_subscription" && action.merchant) {
            await apiFetch("/api/tags/toggle", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ merchant: action.merchant, tagName: "cancel", action: "add" }),
            });
            await apiFetch("/api/tags/toggle", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ merchant: action.merchant, tagName: "kill-list", action: "remove" }),
            });
            router.refresh();
          }
          // apply_suggestion is handled inside ActionQueue, not here — top
          // CTAs are the "I'll do it now" surface; for actually applying a
          // budget we send the user to the queue.
          if (action.kind === "apply_suggestion") {
            const el = document.getElementById("action-queue");
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          }
          break;
      }
    } finally {
      setBusyId(null);
    }
  };

  // Total impact of top 3 actions — frames the CTA strip with concrete number.
  const topImpact = topActions.slice(0, 3).reduce((s, a) => s + a.monthlyImpact, 0);

  return (
    <Card className={`${style.border} ${style.bg}`}>
      <CardContent className="py-5 px-5">
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-lg ${style.iconBg} ${style.iconColor} flex items-center justify-center shrink-0 mt-0.5`}>
            {style.icon}
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-base font-semibold tracking-tight">{strategy.phaseLabel}</h2>
                <span className="text-xs text-muted-foreground shrink-0">{style.progressLabel}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{strategy.phaseDetail}</p>
            </div>

            <div className="space-y-1.5">
              <Progress value={progressValue} className="h-2" />
              <p className="text-xs text-muted-foreground">{progressDetail}</p>
            </div>

            {topActions.length > 0 && (
              <div className="pt-3 border-t border-border/60">
                <div className="flex items-baseline justify-between mb-2">
                  <p className="text-xs font-medium text-foreground">
                    Action of the week — top {Math.min(3, topActions.length)}
                  </p>
                  {topImpact > 0 && (
                    <p className="text-xs text-muted-foreground">
                      ≈ {formatCurrency(topImpact)}/mo if all done
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  {topActions.slice(0, 3).map((action) => (
                    <div key={action.id} className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-background/50 transition-colors">
                      <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{action.title}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{action.detail}</p>
                      </div>
                      <span className="text-xs font-semibold tabular-nums shrink-0 text-emerald-600">
                        {formatCurrency(action.monthlyImpact)}/mo
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCta(action)}
                        disabled={busyId === action.id}
                        className="h-7 text-xs shrink-0 min-w-[88px]"
                      >
                        {busyId === action.id ? "..." : (
                          <>
                            {action.ctaLabel}
                            <ArrowRight className="w-3 h-3 ml-1" />
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

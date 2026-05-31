"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/format";
import { apiFetch } from "@/lib/client/api";
import { useRouter } from "next/navigation";
import { ShieldCheck, MapPin, Unlock, Lock, Link2 } from "lucide-react";
import type { BudgetStrategy } from "@/lib/actions/budget";

type Props = {
  strategy: BudgetStrategy;
  savingsBudgetCategoryId: string | null; // null when user has no Savings budget set
  savingsBudgetCents: number;              // 0 if not set
};

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function GoalCommitments({ strategy, savingsBudgetCategoryId, savingsBudgetCents }: Props) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const moveProgress = strategy.moveTargetCents > 0
    ? Math.min(100, Math.round((strategy.moveSavedCents / strategy.moveTargetCents) * 100))
    : 0;

  // Houston is "active" (full color, not muted) when buffer is full OR user has overridden the lock.
  const houstonActive = strategy.phase === "save" || strategy.moveUnlocked;

  // Plan-aware buffer ETA — if budgets are set + honored, surplus is plannedSurplus.
  // This lets the buffer ETA reflect the user's plan, not just historical actuals.
  const plannedBufferEta =
    strategy.plannedSurplus > 0 && strategy.bufferRemainingCents > 0
      ? Math.ceil(strategy.bufferRemainingCents / strategy.plannedSurplus)
      : null;
  const showPlanEta = strategy.plannedSurplus > 0 && strategy.surplusMonthly <= 0;
  const showUnlockButton = strategy.phase === "build_buffer" && !strategy.moveUnlocked;
  const showRelockButton = strategy.moveUnlocked && strategy.phase !== "save";

  const toggleUnlock = async (unlocked: boolean) => {
    setBusy(true);
    await apiFetch("/api/budget/houston-unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unlocked }),
    });
    setBusy(false);
    router.refresh();
  };

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card className={strategy.phase === "build_buffer" ? "border-amber-300 dark:border-amber-800" : undefined}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-600" />
              Cash Buffer
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              one paycheck of cushion
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-bold tracking-tight">{formatCurrency(strategy.bufferCurrentCents)}</p>
            <p className="text-sm text-muted-foreground">of {formatCurrency(strategy.bufferTargetCents)}</p>
          </div>
          <Progress value={strategy.bufferPercent} className="h-2" />
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{strategy.bufferPercent}% funded</span>
            <span className={strategy.bufferEtaMonths === null && !showPlanEta ? "text-red-500" : "text-muted-foreground"}>
              {strategy.bufferRemainingCents === 0
                ? "✓ funded"
                : strategy.bufferEtaMonths !== null
                  ? `~${strategy.bufferEtaMonths} mo at current pace`
                  : showPlanEta && plannedBufferEta !== null
                    ? `~${plannedBufferEta} mo if you honor budgets`
                    : "no surplus to save yet"}
            </span>
          </div>
          {savingsBudgetCategoryId && savingsBudgetCents > 0 && (
            <button
              onClick={() => {
                const el = document.getElementById(`budget-row-${savingsBudgetCategoryId}`);
                if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              className="w-full text-left flex items-center gap-1.5 text-[11px] text-muted-foreground border-t border-border pt-2 mt-1 hover:text-foreground transition-colors group"
            >
              <Link2 className="w-3 h-3 group-hover:text-emerald-600" />
              Fed by <strong className="text-foreground">{formatCurrency(savingsBudgetCents)}/mo</strong> Savings budget · click to view
            </button>
          )}
          {strategy.earmarkedCents > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {formatCurrency(strategy.earmarkedCents)} of {formatCurrency(strategy.totalSavingsCents)} earmarked (tax/etc.)
            </p>
          )}
        </CardContent>
      </Card>

      <Card className={`${houstonActive ? "border-emerald-300 dark:border-emerald-800" : "opacity-90"}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-600" />
              Houston Move
              {strategy.moveUnlocked && strategy.phase !== "save" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 font-medium">
                  UNLOCKED
                </span>
              )}
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              by {shortDate(strategy.moveDate)}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-bold tracking-tight">{formatCurrency(strategy.moveSavedCents)}</p>
            <p className="text-sm text-muted-foreground">of {formatCurrency(strategy.moveTargetCents)}</p>
          </div>
          <Progress value={moveProgress} className="h-2" />
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{moveProgress}% funded</span>
            <span className="text-muted-foreground">
              {strategy.moveMonthsRemaining === null
                ? "no plan date"
                : strategy.moveMonthsRemaining === 0
                  ? "due now"
                  : `${formatCurrency(strategy.moveRequiredPaceCents)}/mo · ${strategy.moveMonthsRemaining} mo left`}
            </span>
          </div>
          {showUnlockButton && (
            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-[11px] text-muted-foreground">
                Default: locked until buffer is fully funded. Override if you want to start splitting surplus into Houston now.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => toggleUnlock(true)}
                disabled={busy}
                className="h-7 text-xs w-full"
              >
                <Unlock className="w-3 h-3 mr-1.5" />
                {busy ? "..." : "Allocate to Houston anyway"}
              </Button>
            </div>
          )}
          {showRelockButton && (
            <div className="border-t border-border pt-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => toggleUnlock(false)}
                disabled={busy}
                className="h-7 text-xs w-full text-muted-foreground"
              >
                <Lock className="w-3 h-3 mr-1.5" />
                {busy ? "..." : "Re-lock — buffer first"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

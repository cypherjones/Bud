"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/format";
import { apiFetch } from "@/lib/client/api";
import { useRouter } from "next/navigation";
import { Scissors, ChevronDown, ChevronRight, CheckCircle2, X } from "lucide-react";
import type { BudgetSuggestion } from "@/lib/actions/budget";

type Props = {
  suggestions: BudgetSuggestion[];
};

export function SuggestedCutsPanel({ suggestions }: Props) {
  const [open, setOpen] = useState(true);
  const [busyAll, setBusyAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();

  if (suggestions.length === 0) {
    return (
      <Card className="border-emerald-200 dark:border-emerald-800">
        <CardContent className="pt-5 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <div>
            <p className="text-sm font-medium">No cut suggestions right now</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              You&apos;re honoring budgets across cuttable categories — or trailing-30 spend is too low to flag.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalDelta = suggestions.reduce((s, x) => s + x.monthlyDelta, 0);
  const highImpact = suggestions.filter((s) => s.priority === "high");
  const highImpactDelta = highImpact.reduce((s, x) => s + x.monthlyDelta, 0);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const applyOne = async (s: BudgetSuggestion) => {
    setBusyId(s.categoryId);
    const res = await apiFetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: s.categoryId,
        amount: s.suggestedBudget / 100,
      }),
    });
    setBusyId(null);
    if (res.ok) {
      showToast(`${s.categoryName} budget set to ${formatCurrency(s.suggestedBudget)}/mo · saving ${formatCurrency(s.monthlyDelta)}/mo`);
      router.refresh();
    } else {
      showToast(`Failed to update ${s.categoryName}`);
    }
  };

  const dismiss = async (s: BudgetSuggestion) => {
    setBusyId(s.categoryId);
    await apiFetch("/api/budget/dismiss-suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: s.categoryId }),
    });
    setBusyId(null);
    showToast(`Snoozed ${s.categoryName} for 30 days`);
    router.refresh();
  };

  const applyMany = async (subset: BudgetSuggestion[]) => {
    setBusyAll(true);
    setProgress({ done: 0, total: subset.length, failed: 0 });
    let failed = 0;
    // Promise.allSettled would parallelize but the rate limiter on /api/budgets
    // POST is permissive enough; sequential keeps the progress counter honest.
    for (let i = 0; i < subset.length; i++) {
      const s = subset[i];
      const res = await apiFetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: s.categoryId,
          amount: s.suggestedBudget / 100,
        }),
      });
      if (!res.ok) failed++;
      setProgress({ done: i + 1, total: subset.length, failed });
    }
    setBusyAll(false);
    setProgress(null);
    const totalSaved = subset.reduce((s, x) => s + x.monthlyDelta, 0);
    if (failed === 0) {
      showToast(`Applied ${subset.length} budget${subset.length === 1 ? "" : "s"} · saving ${formatCurrency(totalSaved)}/mo`);
    } else {
      showToast(`Applied ${subset.length - failed} of ${subset.length} (${failed} failed)`);
    }
    router.refresh();
  };

  return (
    <Card className="border-amber-200 dark:border-amber-800 relative">
      {toast && (
        <div className="absolute top-3 right-3 z-10 bg-foreground text-background text-xs px-3 py-2 rounded-md shadow-lg max-w-xs">
          {toast}
        </div>
      )}
      <CardHeader className="pb-3 cursor-pointer select-none" onClick={() => setOpen(!open)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <Scissors className="w-4 h-4 text-amber-600" />
            Suggested cuts
            <span className="text-xs font-normal text-muted-foreground">
              · {suggestions.length} categor{suggestions.length === 1 ? "y" : "ies"} · save up to {formatCurrency(totalDelta)}/mo
            </span>
          </CardTitle>
          {open && (
            <div className="flex items-center gap-2">
              {highImpact.length > 0 && highImpact.length < suggestions.length && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => { e.stopPropagation(); applyMany(highImpact); }}
                  disabled={busyAll}
                  className="h-7 text-xs"
                >
                  {busyAll && progress
                    ? `${progress.done}/${progress.total}...`
                    : `High-impact only (${highImpact.length} · ${formatCurrency(highImpactDelta)}/mo)`}
                </Button>
              )}
              <Button
                size="sm"
                onClick={(e) => { e.stopPropagation(); applyMany(suggestions); }}
                disabled={busyAll}
                className="h-7 text-xs"
              >
                {busyAll && progress
                  ? `Applying ${progress.done}/${progress.total}...`
                  : `Apply all (${suggestions.length})`}
              </Button>
            </div>
          )}
        </div>
        {!open && (
          <p className="text-xs text-muted-foreground mt-1 ml-6">
            Click to expand. Auto-derived from trailing-30 spend in cuttable categories.
          </p>
        )}
      </CardHeader>
      {open && (
        <CardContent className="pt-0 space-y-1.5">
          <p className="text-xs text-muted-foreground mb-3">
            <strong>Set</strong> = no budget yet · <strong>Tighten</strong> = lower an honored budget · <strong>Realign</strong> = give a blown budget a realistic target.
            Hit × to snooze a row for 30 days.
          </p>
          {suggestions.map((s) => (
            <div
              key={s.categoryId}
              className={`flex items-center gap-3 py-2.5 px-3 rounded-md border ${
                s.priority === "high"
                  ? "border-amber-300 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/10"
                  : "border-border"
              }`}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.categoryColor }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium truncate">{s.categoryName}</p>
                  <ModeBadge mode={s.mode} />
                  {s.priority === "high" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 font-medium">
                      HIGH
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{s.reasoning}</p>
              </div>
              <div className="flex items-center gap-4 shrink-0 text-right">
                <div className="text-xs">
                  <p className="text-muted-foreground">Now</p>
                  <p className="font-medium tabular-nums">{formatCurrency(s.current30dSpend)}</p>
                </div>
                <span className="text-muted-foreground">→</span>
                <div className="text-xs">
                  <p className="text-muted-foreground">Target</p>
                  <p className="font-medium tabular-nums text-emerald-600">{formatCurrency(s.suggestedBudget)}</p>
                </div>
                <div className="text-xs">
                  <p className="text-muted-foreground">Save</p>
                  <p className="font-semibold tabular-nums">{formatCurrency(s.monthlyDelta)}/mo</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => applyOne(s)}
                  disabled={busyId === s.categoryId || busyAll}
                  className="h-7 text-xs min-w-[64px]"
                >
                  {busyId === s.categoryId ? "..." : s.actionLabel}
                </Button>
                <button
                  onClick={() => dismiss(s)}
                  disabled={busyId === s.categoryId || busyAll}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1"
                  title="Snooze for 30 days"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}

function ModeBadge({ mode }: { mode: BudgetSuggestion["mode"] }) {
  const styles = {
    set: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
    tighten: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
    realign: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide ${styles[mode]}`}>
      {mode}
    </span>
  );
}

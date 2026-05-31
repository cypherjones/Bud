"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import { apiFetch } from "@/lib/client/api";
import { useRouter } from "next/navigation";
import { AlertCircle, X } from "lucide-react";
import type { StaleBudget } from "@/lib/actions/budget";

type Props = {
  staleBudgets: StaleBudget[];
};

/** Banner above the budget table that flags budgets which no longer reflect
 *  reality — categories with no active recurring AND <20% of budget spent in
 *  trailing 30. The Geico-cancelled-Auto-Insurance-$501 case is exactly this:
 *  budget sat for a month silently inflating the variable rate.
 *
 *  One-tap "drop" updates the budget to the current trailing-30 (or zero).
 *  Dismissable per-session if the user wants to keep the stale value. */
export function StaleBudgetBanner({ staleBudgets }: Props) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const visible = staleBudgets.filter((s) => !dismissed.has(s.budgetId));
  if (visible.length === 0) return null;

  const handleDrop = async (s: StaleBudget) => {
    setBusy(s.budgetId);
    try {
      // If suggested is zero, delete the budget outright (cleaner than $0).
      if (s.suggestedBudgetCents === 0) {
        await apiFetch("/api/budgets", {
          method: "DELETE",
          body: JSON.stringify({ budgetId: s.budgetId }),
        });
      } else {
        await apiFetch("/api/budgets", {
          method: "POST",
          body: JSON.stringify({
            categoryId: s.categoryId,
            amount: s.suggestedBudgetCents / 100,
          }),
        });
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const handleDismiss = (id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  };

  return (
    <Card className="border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20">
      <CardContent className="py-3 px-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <p className="text-sm font-semibold tracking-tight">
              {visible.length} stale budget{visible.length === 1 ? "" : "s"} skewing your forecast
            </p>
            <p className="text-[11px] text-muted-foreground">
              No active recurring · less than 20% of budget spent in last 30 days. These quietly inflate the cash-flow rate cap.
            </p>
            <div className="space-y-1.5 pt-1">
              {visible.map((s) => (
                <div key={s.budgetId} className="flex items-center justify-between gap-2 text-xs flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium">{s.categoryName}</span>
                    <span className="text-muted-foreground tabular-nums">
                      budget {formatCurrency(s.budgetCents)} · last 30: {s.trailing30Cents === 0 ? "no spend" : formatCurrency(s.trailing30Cents)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleDrop(s)}
                      disabled={busy === s.budgetId}
                      className="text-[11px] px-2 py-0.5 rounded bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50"
                    >
                      {s.suggestedBudgetCents === 0 ? "Remove budget" : `Drop to ${formatCurrency(s.suggestedBudgetCents)}`}
                    </button>
                    <button
                      onClick={() => handleDismiss(s.budgetId)}
                      className="text-muted-foreground hover:text-foreground p-0.5"
                      title="Dismiss"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

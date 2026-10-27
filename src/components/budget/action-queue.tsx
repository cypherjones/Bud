"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/format";
import { apiFetch } from "@/lib/client/api";
import { useRouter } from "next/navigation";
import { ListTodo, ArrowRight, X, ChevronDown, ChevronRight } from "lucide-react";
import type { ActionItem } from "@/lib/actions/budget";

type Props = {
  actions: ActionItem[];
};

export function ActionQueue({ actions }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();

  const visible = showAll ? actions : actions.slice(0, 7);
  const hiddenCount = Math.max(0, actions.length - 7);
  const totalImpact = actions.reduce((s, a) => s + a.monthlyImpact, 0);
  const visibleImpact = visible.reduce((s, a) => s + a.monthlyImpact, 0);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleAction = async (action: ActionItem) => {
    setBusyId(action.id);
    try {
      switch (action.ctaType) {
        case "scroll": {
          // Updating the hash fires the CSS :target pulse animation on the
          // budget row — without this, scroll happens silently and the user
          // can't tell if anything worked. Force a tick of "no hash" first
          // so re-clicking the same row re-fires the animation.
          if (window.location.hash === `#${action.ctaTarget}`) {
            window.location.hash = "";
          }
          window.location.hash = action.ctaTarget;
          setTimeout(() => {
            const el = document.getElementById(action.ctaTarget);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 30);
          break;
        }
        case "link":
          router.push(action.ctaTarget);
          break;
        case "tag": {
          if (action.kind === "kill_subscription" && action.merchant) {
            const res1 = await apiFetch("/api/tags/toggle", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ merchant: action.merchant, tagName: "cancel", action: "add" }),
            });
            const res2 = await apiFetch("/api/tags/toggle", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ merchant: action.merchant, tagName: "kill-list", action: "remove" }),
            });
            if (res1.ok && res2.ok) {
              showToast(`✓ ${action.merchant} marked cancelled — view in /reports → Subscriptions`);
              router.refresh();
            } else {
              showToast(`Failed to update ${action.merchant} — check tag toggle`);
            }
          }
          break;
        }
      }
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (action: ActionItem) => {
    if (!action.categoryId) return; // can't dismiss non-category actions
    setBusyId(action.id);
    await apiFetch("/api/budget/dismiss-suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: action.categoryId }),
    });
    setBusyId(null);
    showToast("Snoozed for 30 days");
    router.refresh();
  };


  if (actions.length === 0) {
    return (
      <Card className="border-emerald-200 dark:border-emerald-800">
        <CardContent className="pt-5">
          <p className="text-sm font-medium">Nothing to act on right now</p>
          <p className="text-xs text-muted-foreground mt-1">
            No blown budgets, no cut suggestions, no kill-list candidates, all autopay confirmed. Stay vigilant.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card id="action-queue" className="relative">
      {toast && (
        <div className="absolute top-3 right-3 z-10 bg-foreground text-background text-xs px-3 py-2 rounded-md shadow-lg max-w-xs">
          {toast}
        </div>
      )}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ListTodo className="w-4 h-4" />
            Action queue
            <span className="text-xs font-normal text-muted-foreground">
              · {actions.length} actions · ≈ {formatCurrency(totalImpact)}/mo total
            </span>
          </CardTitle>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Ranked by priority + impact. Pace warnings, blown budgets, cuts, kill-list, autopay — all here.
        </p>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {visible.map((action) => (
          <ActionRow
            key={action.id}
            action={action}
            busy={busyId === action.id}
            disabled={busyId !== null}
            onAct={() => handleAction(action)}
            onDismiss={action.categoryId ? () => dismiss(action) : undefined}
          />
        ))}
        {hiddenCount > 0 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-2 flex items-center justify-center gap-1.5 border-t border-border mt-2"
          >
            {showAll ? (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                Show fewer · top 7 only
              </>
            ) : (
              <>
                <ChevronRight className="w-3.5 h-3.5" />
                Show {hiddenCount} more · {formatCurrency(totalImpact - visibleImpact)}/mo more impact
              </>
            )}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

function ActionRow({
  action,
  busy,
  disabled,
  onAct,
  onDismiss,
}: {
  action: ActionItem;
  busy: boolean;
  disabled: boolean;
  onAct: () => void;
  onDismiss?: () => void;
}) {
  const priorityStyles = {
    high: "border-amber-300 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/10",
    medium: "border-border",
    low: "border-border opacity-90",
  };

  const kindBadgeStyles = {
    honor_blown_budget: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
    apply_suggestion: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
    kill_subscription: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
    set_autopay: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
    pace_warning: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
  };

  const kindLabels = {
    honor_blown_budget: "BLOWN",
    apply_suggestion: "CUT",
    kill_subscription: "KILL",
    set_autopay: "AUTOPAY",
    pace_warning: "PACE",
  };

  const scrollToRow = () => {
    if (!action.categoryId) return;
    // Update hash so the budget row's :target style fires (CSS pulse animation
    // makes the connection between action and table visible at a glance).
    window.location.hash = `budget-row-${action.categoryId}`;
    const el = document.getElementById(`budget-row-${action.categoryId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Render the budget context (current → target) for category-based actions
  // so the row mirrors what's about to change in the table below.
  const showBudgetContext =
    (action.kind === "apply_suggestion" || action.kind === "honor_blown_budget" || action.kind === "pace_warning") &&
    action.categoryId &&
    action.currentSpendCents !== undefined;

  return (
    <div className={`flex items-center gap-3 py-2.5 px-3 rounded-md border ${priorityStyles[action.priority]}`}>
      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium tracking-wide shrink-0 ${kindBadgeStyles[action.kind]}`}>
        {kindLabels[action.kind]}
      </span>
      {action.categoryColor && (
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: action.categoryColor }}
          aria-hidden
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {action.categoryId ? (
            <button
              onClick={scrollToRow}
              className="text-sm font-medium truncate hover:underline decoration-dotted underline-offset-2"
              title="Jump to budget row"
            >
              {action.title}
            </button>
          ) : (
            <p className="text-sm font-medium truncate">{action.title}</p>
          )}
          {action.categoryGroup && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground/70 shrink-0 hidden md:inline">
              {action.categoryGroup}
            </span>
          )}
          {action.priority === "high" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 font-medium">
              HIGH
            </span>
          )}
        </div>
        {showBudgetContext ? (
          <BudgetContextLine action={action} />
        ) : (
          <p className="text-[11px] text-muted-foreground mt-0.5">{action.detail}</p>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {action.monthlyImpact > 0 && (
          <span className="text-xs font-semibold tabular-nums text-emerald-600">
            {formatCurrency(action.monthlyImpact)}/mo
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={onAct}
          disabled={busy || disabled}
          className="h-7 text-xs min-w-[88px]"
        >
          {busy ? "..." : (
            <>
              {action.ctaLabel}
              <ArrowRight className="w-3 h-3 ml-1" />
            </>
          )}
        </Button>
        {onDismiss && (
          <button
            onClick={onDismiss}
            disabled={busy || disabled}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
            title="Snooze for 30 days"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Renders "budget $X · actual $Y → target $Z" for category-based actions so
 *  the row literally previews what the budget table will read after Apply. */
function BudgetContextLine({ action }: { action: ActionItem }) {
  const hasBudget = action.currentBudgetCents !== undefined && action.currentBudgetCents > 0;
  const hasTarget = action.suggestedBudgetCents !== undefined;
  return (
    <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
      {hasBudget ? (
        <>
          Budget <span className="font-medium text-foreground">{formatCurrency(action.currentBudgetCents!)}</span>
        </>
      ) : (
        <span className="italic">No budget set</span>
      )}
      {action.currentSpendCents !== undefined && (
        <>
          {" · "}30d <span className={`font-medium ${hasBudget && action.currentSpendCents > action.currentBudgetCents! ? "text-red-500" : "text-foreground"}`}>{formatCurrency(action.currentSpendCents)}</span>
        </>
      )}
      {hasTarget && (
        <>
          {" → "}new target <span className="font-medium text-emerald-600">{formatCurrency(action.suggestedBudgetCents!)}</span>
        </>
      )}
    </p>
  );
}

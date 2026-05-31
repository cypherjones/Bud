"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils/format";
import { apiFetch } from "@/lib/client/api";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Clock, X, Plus, ExternalLink, ListChecks } from "lucide-react";
import Link from "next/link";
import type { ActionPlanItem, ActionPlanStatus, ActionPlanPhase } from "@/lib/actions/action-plan";

type Props = {
  items: ActionPlanItem[];
};

const PHASE_ORDER: ActionPlanPhase[] = ["now", "this_week", "this_month", "ongoing"];
const PHASE_LABEL: Record<ActionPlanPhase, string> = {
  now: "This weekend",
  this_week: "This week",
  this_month: "This month",
  ongoing: "Ongoing",
};

export function PlanChecklist({ items }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPhase, setNewPhase] = useState<ActionPlanPhase>("now");
  const [showCompleted, setShowCompleted] = useState(false);
  const router = useRouter();

  const visibleItems = showCompleted ? items : items.filter((i) => i.status !== "completed" && i.status !== "skipped");
  const groupedByPhase = new Map<ActionPlanPhase, ActionPlanItem[]>();
  for (const phase of PHASE_ORDER) groupedByPhase.set(phase, []);
  for (const item of visibleItems) {
    groupedByPhase.get(item.phase)?.push(item);
  }

  const completedCount = items.filter((i) => i.status === "completed").length;
  const totalCount = items.length;
  const totalSavings = items
    .filter((i) => i.status !== "completed" && i.status !== "skipped")
    .reduce((s, i) => s + (i.estimatedSavingsCents ?? 0), 0);

  const setStatus = async (id: string, status: ActionPlanStatus) => {
    setBusyId(id);
    await apiFetch("/api/action-plan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    setBusyId(null);
    router.refresh();
  };

  const remove = async (id: string) => {
    setBusyId(id);
    await apiFetch("/api/action-plan", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setBusyId(null);
    router.refresh();
  };

  const addItem = async () => {
    if (!newTitle.trim()) return;
    await apiFetch("/api/action-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim(), phase: newPhase, sortOrder: 999 }),
    });
    setNewTitle("");
    setAdding(false);
    router.refresh();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ListChecks className="w-4 h-4" />
            Action plan
            <span className="text-xs font-normal text-muted-foreground">
              · {completedCount}/{totalCount} done
              {totalSavings > 0 && ` · ${formatCurrency(totalSavings)}/mo on the table`}
            </span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {showCompleted ? "Hide done" : "Show done"}
            </button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAdding(true)}>
              <Plus className="w-3 h-3 mr-1" /> Add
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {adding && (
          <div className="flex items-center gap-2 p-3 rounded-md border border-border bg-accent/20">
            <Input
              type="text"
              placeholder="What needs to happen?"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addItem();
                if (e.key === "Escape") { setAdding(false); setNewTitle(""); }
              }}
              autoFocus
              className="flex-1 text-sm"
            />
            <select
              value={newPhase}
              onChange={(e) => setNewPhase(e.target.value as ActionPlanPhase)}
              className="rounded border border-border bg-background px-2 py-1 text-sm"
            >
              {PHASE_ORDER.map((p) => (
                <option key={p} value={p}>{PHASE_LABEL[p]}</option>
              ))}
            </select>
            <Button size="sm" onClick={addItem} disabled={!newTitle.trim()} className="h-8 text-xs">
              Add
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewTitle(""); }} className="h-8 text-xs">
              Cancel
            </Button>
          </div>
        )}

        {PHASE_ORDER.map((phase) => {
          const phaseItems = groupedByPhase.get(phase) ?? [];
          if (phaseItems.length === 0) return null;
          const phaseSavings = phaseItems
            .filter((i) => i.status !== "completed" && i.status !== "skipped")
            .reduce((s, i) => s + (i.estimatedSavingsCents ?? 0), 0);
          return (
            <div key={phase}>
              <div className="flex items-baseline justify-between border-b border-border pb-1.5 mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {PHASE_LABEL[phase]}
                </p>
                {phaseSavings > 0 && (
                  <p className="text-[10px] text-emerald-600 tabular-nums">
                    {formatCurrency(phaseSavings)}/mo recoverable
                  </p>
                )}
              </div>
              <div className="space-y-1">
                {phaseItems.map((item) => (
                  <PlanRow
                    key={item.id}
                    item={item}
                    busy={busyId === item.id}
                    onStatusChange={setStatus}
                    onRemove={remove}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {visibleItems.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground text-center py-6">
            All caught up. Add a new action above to grow the plan.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PlanRow({
  item,
  busy,
  onStatusChange,
  onRemove,
}: {
  item: ActionPlanItem;
  busy: boolean;
  onStatusChange: (id: string, status: ActionPlanStatus) => void;
  onRemove: (id: string) => void;
}) {
  const isDone = item.status === "completed";
  const isInProgress = item.status === "in_progress";

  // Click cycle: pending → in_progress → completed → pending
  const cycleStatus = () => {
    const next: ActionPlanStatus =
      item.status === "pending" ? "in_progress" :
      item.status === "in_progress" ? "completed" :
      item.status === "completed" ? "pending" : "pending";
    onStatusChange(item.id, next);
  };

  return (
    <div className={`flex items-start gap-3 py-2 px-2 rounded-md hover:bg-accent/30 transition-colors ${isDone ? "opacity-60" : ""}`}>
      <button
        onClick={cycleStatus}
        disabled={busy}
        className="mt-0.5 shrink-0"
        title={isDone ? "Mark pending" : isInProgress ? "Mark done" : "Mark in progress"}
      >
        {isDone ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        ) : isInProgress ? (
          <Clock className="w-4 h-4 text-amber-500" />
        ) : (
          <Circle className="w-4 h-4 text-muted-foreground hover:text-foreground" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className={`text-sm ${isDone ? "line-through text-muted-foreground" : "font-medium"}`}>
            {item.title}
          </p>
          {item.estimatedSavingsCents !== null && item.estimatedSavingsCents > 0 && !isDone && (
            <span className="text-xs font-semibold text-emerald-600 tabular-nums">
              {formatCurrency(item.estimatedSavingsCents)}/mo
            </span>
          )}
          {item.link && !isDone && (
            <Link
              href={item.link}
              className="text-xs text-blue-600 hover:underline inline-flex items-center gap-0.5"
            >
              {item.link}
              <ExternalLink className="w-3 h-3" />
            </Link>
          )}
        </div>
        {item.description && !isDone && (
          <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{item.description}</p>
        )}
      </div>

      <button
        onClick={() => onRemove(item.id)}
        disabled={busy}
        className="text-muted-foreground hover:text-red-500 transition-colors p-1 mt-0.5"
        title="Remove from plan"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Wallet, Pencil } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils/format";
import { apiFetch } from "@/lib/client/api";
import type { CreditTriageSummary } from "@/lib/actions/credit-triage";

type Props = {
  summary: CreditTriageSummary;
};

export function SettlementBudgetCard({ summary }: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [budgetInput, setBudgetInput] = useState((summary.settlementBudgetCents / 100).toString());
  const [submitting, setSubmitting] = useState(false);

  const damageResolvedPct =
    summary.totalDamage > 0
      ? Math.min(100, Math.round((summary.totalSettled / summary.totalDamage) * 100))
      : 0;
  const budgetUsedPct =
    summary.settlementBudgetCents > 0
      ? Math.min(100, Math.round((summary.totalSettled / summary.settlementBudgetCents) * 100))
      : 0;

  async function handleSaveBudget() {
    const dollars = parseFloat(budgetInput);
    if (!Number.isFinite(dollars) || dollars < 0) {
      toast.error("Budget must be zero or positive");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/credit/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budgetDollars: dollars }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Failed to save");
        return;
      }
      toast.success("Budget updated");
      setEditOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary" />
            Settlement Budget
          </CardTitle>
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <Pencil className="w-3 h-3" />
              edit budget
            </button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Set settlement budget</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 text-sm">
                <label className="text-xs text-muted-foreground">Total $ available to clear charge-offs and collections</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="100"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground">
                  Reasonable starting point: $5,000–8,000. The bigger the budget, the more pay-for-delete leverage you have.
                </p>
              </div>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
                <Button onClick={handleSaveBudget} disabled={submitting}>
                  {submitting ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Damage row */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Total damage being negotiated</span>
            <span className="font-semibold text-foreground">{formatCurrency(summary.totalDamage)}</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${damageResolvedPct}%` }} />
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{damageResolvedPct}% resolved</span>
            <span>
              {summary.itemsResolvedCount} of {summary.itemsTotalCount} items
            </span>
          </div>
          {summary.duplicateExposure > 0 && (
            <p className="text-[10px] text-red-400">
              {formatCurrency(summary.duplicateExposure)} of duplicate exposure — disputable, free to resolve.
            </p>
          )}
        </div>

        {/* Budget row */}
        <div className="space-y-1.5 pt-3 border-t border-border">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Budget</span>
            <span className="font-semibold text-foreground">{formatCurrency(summary.settlementBudgetCents)}</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-amber-500 transition-all" style={{ width: `${budgetUsedPct}%` }} />
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{formatCurrency(summary.totalSettled)} spent settling</span>
            <span>
              {formatCurrency(Math.max(0, summary.remainingBudget))} remaining
            </span>
          </div>
          {summary.totalOffered > 0 && (
            <p className="text-[10px] text-muted-foreground">
              {formatCurrency(summary.totalOffered)} pending in extended offers (unaccepted).
            </p>
          )}
        </div>

        {/* Quick math */}
        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-border">
          <Stat label="Charge-offs" value={formatCurrency(summary.chargeOffBalance)} />
          <Stat label="Collections" value={formatCurrency(summary.collectionBalance)} />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  );
}

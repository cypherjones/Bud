"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import { apiFetch } from "@/lib/client/api";
import { useRouter } from "next/navigation";
import { Zap, AlertTriangle, CheckCircle2 } from "lucide-react";

type DebtRow = {
  id: string;
  creditorName: string;
  minimumPayment: number; // cents
  dueDay: number | null;
  autopayEnabled: boolean;
  autopaySetAt: string | null;
};

type Props = {
  debts: DebtRow[];
  recentLateFees: number; // cents — trailing-30 Late Fees & Interest
};

export function AutopayChecklist({ debts, recentLateFees }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();

  const setupCount = debts.filter((d) => d.autopayEnabled).length;
  const missingCount = debts.length - setupCount;
  const allCovered = missingCount === 0 && debts.length > 0;

  const toggle = async (debtId: string, enabled: boolean) => {
    setBusy(debtId);
    await apiFetch("/api/debts/autopay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ debtId, enabled }),
    });
    setBusy(null);
    router.refresh();
  };

  return (
    <Card className={allCovered ? "border-emerald-200 dark:border-emerald-800" : "border-amber-300 dark:border-amber-800"}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Zap className={`w-4 h-4 ${allCovered ? "text-emerald-600" : "text-amber-600"}`} />
          Auto-pay setup
          <span className="text-xs font-normal text-muted-foreground">
            {allCovered
              ? "· all debts covered"
              : `· ${missingCount} debt${missingCount === 1 ? "" : "s"} without auto-pay`}
          </span>
        </CardTitle>
        {recentLateFees > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            {formatCurrency(recentLateFees)}/mo in Late Fees & Interest last 30 days. Setting auto-pay on all minimums kills this.
          </p>
        )}
        {allCovered && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            All active debts have auto-pay confirmed. Late-fee bleed should stop.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-1.5">
        {debts.map((debt) => (
          <div
            key={debt.id}
            className={`flex items-center gap-3 py-2.5 px-3 rounded-md border ${
              debt.autopayEnabled
                ? "border-emerald-200 bg-emerald-50/30 dark:border-emerald-900 dark:bg-emerald-950/10"
                : "border-amber-200 dark:border-amber-900"
            }`}
          >
            <button
              onClick={() => toggle(debt.id, !debt.autopayEnabled)}
              disabled={busy === debt.id}
              className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                debt.autopayEnabled
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-muted-foreground hover:border-emerald-500"
              }`}
              title={debt.autopayEnabled ? "Mark as not set up" : "Mark as set up"}
            >
              {busy === debt.id ? (
                <span className="text-[10px]">...</span>
              ) : debt.autopayEnabled ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : null}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{debt.creditorName}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {formatCurrency(debt.minimumPayment)}/mo minimum
                {debt.dueDay ? ` · due day ${debt.dueDay}` : " · no due day set"}
                {debt.autopaySetAt && ` · marked ${new Date(debt.autopaySetAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
              </p>
            </div>
            {!debt.autopayEnabled && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium uppercase tracking-wide shrink-0">
                Set up
              </span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

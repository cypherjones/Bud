"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Calendar, Scissors, CheckCircle2, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { apiFetch } from "@/lib/client/api";
import { useRouter } from "next/navigation";

type Bill = {
  id: string;
  merchant: string;
  amount: number;
  dueDate: string;
  daysUntil: number;
  category: string | null;
  groupName: string | null;
};

type Sub = {
  merchant: string;
  monthlyCost: number;
  category: string | null;
};

type Props = {
  bills7d: Bill[];
  killList: Sub[];
  killListMonthly: number;
};

function shortDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function ActionPlanWidget({ bills7d, killList, killListMonthly }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();

  const totalDue = bills7d.reduce((s, b) => s + b.amount, 0);

  const markCancelled = async (merchant: string) => {
    setBusy(merchant);
    // Add #cancel, then strip #kill-list so it doesn't show twice.
    await apiFetch("/api/tags/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchant, tagName: "cancel", action: "add" }),
    });
    await apiFetch("/api/tags/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchant, tagName: "kill-list", action: "remove" }),
    });
    setBusy(null);
    router.refresh();
  };

  const removeFromKillList = async (merchant: string) => {
    setBusy(merchant);
    await apiFetch("/api/tags/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchant, tagName: "kill-list", action: "remove" }),
    });
    setBusy(null);
    router.refresh();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Action Plan</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="bills" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="bills" className="text-xs">
              <Calendar className="w-3.5 h-3.5 mr-1.5" />
              Bills · next 7d
              {bills7d.length > 0 && (
                <span className="ml-1.5 text-[10px] text-muted-foreground">({bills7d.length})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="kill" className="text-xs">
              <Scissors className="w-3.5 h-3.5 mr-1.5" />
              Sub Kill List
              {killList.length > 0 && (
                <span className="ml-1.5 text-[10px] text-muted-foreground">({killList.length})</span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="bills" className="mt-4">
            {bills7d.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No bills due in the next 7 days.</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-3">
                  <strong className="text-foreground">{formatCurrency(totalDue)}</strong> across {bills7d.length} bill
                  {bills7d.length !== 1 ? "s" : ""} hitting this week. Make sure each lands on a day you have cash.
                </p>
                <div className="space-y-1.5">
                  {bills7d.map((bill) => {
                    const isToday = bill.daysUntil === 0;
                    const isTomorrow = bill.daysUntil === 1;
                    const urgent = isToday || isTomorrow;
                    return (
                      <div
                        key={bill.id}
                        className={`flex items-center justify-between gap-3 py-2 px-3 rounded-md border ${
                          urgent
                            ? "border-amber-300 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20"
                            : "border-border"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {urgent && <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{bill.merchant}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {shortDate(bill.dueDate)}
                              {isToday ? " · today" : isTomorrow ? " · tomorrow" : ` · in ${bill.daysUntil}d`}
                              {bill.category && ` · ${bill.category}`}
                            </p>
                          </div>
                        </div>
                        <span className="text-sm font-semibold tabular-nums shrink-0">
                          {formatCurrency(bill.amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="kill" className="mt-4">
            {killList.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground">No subs on your kill list.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Add one from the Subscriptions tab in /reports — click &quot;Add to Kill List&quot;.
                </p>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-3">
                  Cancelling all {killList.length} frees{" "}
                  <strong className="text-foreground">{formatCurrency(killListMonthly)}/mo</strong> ({formatCurrency(killListMonthly * 12)}/yr).
                  Check off as you cancel each — it moves to your Cancelled list automatically.
                </p>
                <div className="space-y-1.5">
                  {killList.map((sub) => (
                    <div
                      key={sub.merchant}
                      className="flex items-center justify-between gap-2 py-2 px-3 rounded-md border border-border"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <button
                          onClick={() => markCancelled(sub.merchant)}
                          disabled={busy === sub.merchant}
                          className="shrink-0 w-5 h-5 rounded border-2 border-muted-foreground hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors flex items-center justify-center"
                          title="Mark as cancelled"
                        >
                          {busy === sub.merchant ? (
                            <span className="text-[10px]">...</span>
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-transparent hover:text-emerald-600" />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{sub.merchant}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {sub.category ?? "—"} · {formatCurrency(sub.monthlyCost * 12)}/yr saved
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold tabular-nums">
                          {formatCurrency(sub.monthlyCost)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFromKillList(sub.merchant)}
                          disabled={busy === sub.merchant}
                          className="h-6 px-1.5 text-[10px] text-muted-foreground"
                          title="Remove from kill list"
                        >
                          ×
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

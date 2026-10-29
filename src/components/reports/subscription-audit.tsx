"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils/format";
import { apiFetch } from "@/lib/client/api";
import { useRouter } from "next/navigation";
import { Ban, Undo2, X, Clock, Wallet, Scissors } from "lucide-react";

type Sub = {
  merchant: string;
  monthlyCost: number;
  category: string | null;
  lastSeen: string;
  flaggedCancel: boolean;
  flaggedReimbursable?: boolean;
  flaggedKillList?: boolean;
  daysSinceLastSeen?: number;
  isStale?: boolean;
};

type Props = {
  data: {
    subscriptions: Sub[];
    staleSubscriptions?: Sub[];
    reimbursableSubs?: Sub[];
    killListSubs?: Sub[];
    totalMonthly: number; // active-only (server already excludes flaggedCancel + stale + reimbursable)
    totalAnnual: number;
    reimbursableMonthly?: number;
    killListMonthly?: number;
    cancelledMonthlySavings: number;
    staleMonthly?: number;
  };
};

export function SubscriptionAudit({ data }: Props) {
  const [toggling, setToggling] = useState<string | null>(null);
  const router = useRouter();

  const activeSubs = data.subscriptions.filter(s => !s.flaggedCancel && !s.flaggedReimbursable && !s.flaggedKillList);
  const cancelledSubs = data.subscriptions.filter(s => s.flaggedCancel);
  const staleSubs = data.staleSubscriptions ?? [];
  const reimbursableSubs = data.reimbursableSubs ?? [];
  const killListSubs = data.killListSubs ?? [];
  const killListMonthly = data.killListMonthly ?? 0;
  const activeMonthly = data.totalMonthly;
  const reimbursableMonthly = data.reimbursableMonthly ?? 0;
  const cancelSavings = data.cancelledMonthlySavings;
  const staleMonthly = data.staleMonthly ?? 0;
  const top3Cost = activeSubs.slice(0, 3).reduce((s, sub) => s + sub.monthlyCost, 0);
  const top3Pct = activeMonthly > 0 ? Math.round((top3Cost / activeMonthly) * 100) : 0;

  const setTag = async (merchant: string, tagName: string, action: "add" | "remove") => {
    setToggling(merchant);
    await apiFetch("/api/tags/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchant, tagName, action }),
    });
    setToggling(null);
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {/* Header Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Active Subscriptions</p>
            <p className="text-2xl font-bold tracking-tight mt-1">{formatCurrency(activeMonthly)}</p>
            <p className="text-xs text-muted-foreground mt-1">{activeSubs.length} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Annual Cost</p>
            <p className="text-2xl font-bold tracking-tight mt-1">{formatCurrency(activeMonthly * 12)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Cancelled</p>
            <p className="text-2xl font-bold tracking-tight mt-1 text-emerald-600">{cancelledSubs.length}</p>
            {cancelSavings > 0 && (
              <p className="text-xs text-emerald-600 mt-1">Saving {formatCurrency(cancelSavings)}/mo</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Top 3 Concentration</p>
            <p className="text-2xl font-bold tracking-tight mt-1">{top3Pct}%</p>
            <p className="text-xs text-muted-foreground mt-1">of active cost</p>
          </CardContent>
        </Card>
      </div>

      {/* Active Subscriptions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Service</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Monthly</TableHead>
                <TableHead>Annual</TableHead>
                <TableHead className="pr-4 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeSubs.map((sub, i) => (
                <TableRow key={i}>
                  <TableCell className="pl-4 font-medium">{sub.merchant}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{sub.category ?? "—"}</TableCell>
                  <TableCell className="font-medium">{formatCurrency(sub.monthlyCost)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatCurrency(sub.monthlyCost * 12)}</TableCell>
                  <TableCell className="pr-4 text-right space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setTag(sub.merchant, "kill-list", "add")}
                      disabled={toggling === sub.merchant}
                      className="text-amber-600 hover:text-amber-800 hover:bg-amber-50 h-7 px-2 text-xs"
                      title="Add to kill list — surfaces on dashboard until you cancel"
                    >
                      <Scissors className="w-3 h-3 mr-1" />
                      Kill list
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setTag(sub.merchant, "reimbursable", "add")}
                      disabled={toggling === sub.merchant}
                      className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 h-7 px-2 text-xs"
                      title="Mark as reimbursable — moves out of active burn"
                    >
                      <Wallet className="w-3 h-3 mr-1" />
                      Reimburse
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setTag(sub.merchant, "cancel", "add")}
                      disabled={toggling === sub.merchant}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 px-2 text-xs"
                      title="Already cancelled — moves to Cancelled list"
                    >
                      <Ban className="w-3 h-3 mr-1" />
                      {toggling === sub.merchant ? "..." : "Cancelled"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setTag(sub.merchant, "recurring", "remove")}
                      disabled={toggling === sub.merchant}
                      className="text-muted-foreground hover:text-foreground h-7 px-2 text-xs"
                      title="Not a subscription — remove from this list"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Stale (haven't hit the bank in 60+ days) */}
      {staleSubs.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Stale — not seen in 60+ days
              <span className="text-xs font-normal text-muted-foreground">
                · {staleSubs.length} item{staleSubs.length !== 1 ? "s" : ""} · {formatCurrency(staleMonthly)}/mo if still billing
              </span>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              These charged before but haven&apos;t hit a synced account in the last 60 days.
              Most likely already cancelled or one-offs that were mis-tagged. Confirm and untag.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Service</TableHead>
                  <TableHead>Was Costing</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead className="pr-4 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staleSubs.map((sub, i) => (
                  <TableRow key={i}>
                    <TableCell className="pl-4 font-medium text-muted-foreground">{sub.merchant}</TableCell>
                    <TableCell className="text-muted-foreground">{formatCurrency(sub.monthlyCost)}/mo</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {sub.daysSinceLastSeen ?? "?"}d ago
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setTag(sub.merchant, "recurring", "remove")}
                        disabled={toggling === sub.merchant}
                        className="text-muted-foreground hover:text-foreground h-7 px-2 text-xs"
                      >
                        <X className="w-3 h-3 mr-1" />
                        {toggling === sub.merchant ? "..." : "Untag"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Reimbursable — work-paid SaaS that hits the bank but gets paid back */}
      {reimbursableSubs.length > 0 && (
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-400 flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              Reimbursable — {formatCurrency(reimbursableMonthly)}/mo
              <span className="text-xs font-normal text-muted-foreground">
                · excluded from active burn
              </span>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              These hit your bank but are paid back (work expenses, etc.) — confirm reimbursement is actually happening.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Service</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Monthly</TableHead>
                  <TableHead className="pr-4 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reimbursableSubs.map((sub, i) => (
                  <TableRow key={i} className="bg-blue-50/30 dark:bg-blue-950/10">
                    <TableCell className="pl-4 font-medium">{sub.merchant}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{sub.category ?? "—"}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(sub.monthlyCost)}</TableCell>
                    <TableCell className="pr-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setTag(sub.merchant, "reimbursable", "remove")}
                        disabled={toggling === sub.merchant}
                        className="text-muted-foreground hover:text-foreground h-7 px-2 text-xs"
                      >
                        <Undo2 className="w-3 h-3 mr-1" />
                        {toggling === sub.merchant ? "..." : "Unmark"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Kill List — flagged but not yet cancelled. Mirrored on the dashboard
          checklist so the user doesn't lose track. */}
      {killListSubs.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <Scissors className="w-4 h-4" />
              Kill List — {killListSubs.length} sub{killListSubs.length !== 1 ? "s" : ""} ({formatCurrency(killListMonthly)}/mo)
              <span className="text-xs font-normal text-muted-foreground">
                · {formatCurrency(killListMonthly * 12)}/yr if all cancelled
              </span>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Tagged for cancellation but not yet pulled. Click &quot;Cancelled&quot; once you&apos;ve actually done it.
              Also visible as a checklist on the dashboard.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Service</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Monthly</TableHead>
                  <TableHead className="pr-4 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {killListSubs.map((sub, i) => (
                  <TableRow key={i} className="bg-amber-50/40 dark:bg-amber-950/10">
                    <TableCell className="pl-4 font-medium">{sub.merchant}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{sub.category ?? "—"}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(sub.monthlyCost)}</TableCell>
                    <TableCell className="pr-4 text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          await setTag(sub.merchant, "cancel", "add");
                          await setTag(sub.merchant, "kill-list", "remove");
                        }}
                        disabled={toggling === sub.merchant}
                        className="text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 h-7 px-2 text-xs"
                      >
                        <Ban className="w-3 h-3 mr-1" />
                        {toggling === sub.merchant ? "..." : "Mark cancelled"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setTag(sub.merchant, "kill-list", "remove")}
                        disabled={toggling === sub.merchant}
                        className="text-muted-foreground hover:text-foreground h-7 px-2 text-xs"
                        title="Remove from kill list — keep paying"
                      >
                        <Undo2 className="w-3 h-3 mr-1" />
                        Keep
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Cancelled Subscriptions */}
      {cancelledSubs.length > 0 && (
        <Card className="border-emerald-200 dark:border-emerald-800">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-emerald-700">
              Cancelled — Saving {formatCurrency(cancelSavings)}/mo ({formatCurrency(cancelSavings * 12)}/yr)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Service</TableHead>
                  <TableHead>Was Costing</TableHead>
                  <TableHead className="pr-4 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cancelledSubs.map((sub, i) => (
                  <TableRow key={i} className="bg-emerald-50/50 dark:bg-emerald-950/10">
                    <TableCell className="pl-4 font-medium line-through text-muted-foreground">{sub.merchant}</TableCell>
                    <TableCell className="text-muted-foreground">{formatCurrency(sub.monthlyCost)}/mo</TableCell>
                    <TableCell className="pr-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setTag(sub.merchant, "cancel", "remove")}
                        disabled={toggling === sub.merchant}
                        className="text-muted-foreground hover:text-foreground h-7 px-2 text-xs"
                      >
                        <Undo2 className="w-3 h-3 mr-1" />
                        {toggling === sub.merchant ? "..." : "Undo"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Actionable Insight */}
      <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
        <CardContent className="pt-5">
          <p className="text-sm font-medium">Insight</p>
          <p className="text-sm text-muted-foreground mt-1">
            Your top 3 active subscriptions account for {top3Pct}% of your subscription spend.
            {cancelSavings > 0 && (
              <> You&apos;ve cut {formatCurrency(cancelSavings)}/month ({formatCurrency(cancelSavings * 12)}/year) by cancelling {cancelledSubs.length} subscription{cancelledSubs.length > 1 ? "s" : ""}.</>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

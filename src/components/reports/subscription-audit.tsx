"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils/format";
import { apiFetch } from "@/lib/client/api";
import { useRouter } from "next/navigation";
import { Ban, Undo2, X } from "lucide-react";

type Sub = {
  merchant: string;
  monthlyCost: number;
  category: string | null;
  lastSeen: string;
  flaggedCancel: boolean;
};

type Props = {
  data: {
    subscriptions: Sub[];
    totalMonthly: number;
    totalAnnual: number;
  };
};

export function SubscriptionAudit({ data }: Props) {
  const [toggling, setToggling] = useState<string | null>(null);
  const router = useRouter();

  const activeSubs = data.subscriptions.filter(s => !s.flaggedCancel);
  const cancelledSubs = data.subscriptions.filter(s => s.flaggedCancel);
  const activeMonthly = activeSubs.reduce((s, sub) => s + sub.monthlyCost, 0);
  const cancelSavings = cancelledSubs.reduce((s, sub) => s + sub.monthlyCost, 0);
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
                      onClick={() => setTag(sub.merchant, "cancel", "add")}
                      disabled={toggling === sub.merchant}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 px-2 text-xs"
                    >
                      <Ban className="w-3 h-3 mr-1" />
                      {toggling === sub.merchant ? "..." : "Cancel"}
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

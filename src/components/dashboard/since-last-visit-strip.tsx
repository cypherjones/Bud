"use client";

import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import { apiFetch } from "@/lib/client/api";
import { Sparkles, AlertTriangle } from "lucide-react";

type Props = {
  lastVisitAt: string | null;
  newTransactionCount: number;
  newDebtPaymentCount: number;
  netDelta: number;
  syncErrors: string[];
  staleEnoughToShow: boolean;
};

function relativeTimeFrom(iso: string | null): string {
  if (!iso) return "your last visit";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const minutes = Math.max(0, Math.round((now - then) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function SinceLastVisitStrip({
  lastVisitAt,
  newTransactionCount,
  newDebtPaymentCount,
  netDelta,
  syncErrors,
  staleEnoughToShow,
}: Props) {
  // Always update the visit timestamp on mount, even if the strip is hidden,
  // so the next visit's deltas stay accurate.
  useEffect(() => {
    apiFetch("/api/visit", { method: "POST" }).catch(() => {
      /* fire-and-forget */
    });
  }, []);

  if (!staleEnoughToShow) return null;

  const parts: string[] = [];
  if (newTransactionCount > 0) parts.push(`${newTransactionCount} new transaction${newTransactionCount === 1 ? "" : "s"}`);
  if (newDebtPaymentCount > 0) parts.push(`${newDebtPaymentCount} debt payment${newDebtPaymentCount === 1 ? "" : "s"}`);
  if (netDelta !== 0) {
    const sign = netDelta > 0 ? "+" : "−";
    parts.push(`${sign}${formatCurrency(Math.abs(netDelta))} net`);
  }

  // Don't render an empty strip
  if (parts.length === 0 && syncErrors.length === 0) return null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          <span className="text-muted-foreground">Since {relativeTimeFrom(lastVisitAt)}:</span>
          <span className="font-medium">{parts.join(" · ")}</span>
        </div>
        {syncErrors.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-amber-500">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>
              {syncErrors.length} sync issue{syncErrors.length === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

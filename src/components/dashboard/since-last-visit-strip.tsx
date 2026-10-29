"use client";

import { useEffect } from "react";
import { formatCurrency } from "@/lib/utils/format";
import { apiFetch } from "@/lib/client/api";

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
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** One line on what changed since the last visit. Always stamps the visit, even when hidden. */
export function SinceLastVisitStrip({ lastVisitAt, newTransactionCount, newDebtPaymentCount, netDelta, syncErrors, staleEnoughToShow }: Props) {
  useEffect(() => {
    apiFetch("/api/visit", { method: "POST" }).catch(() => {});
  }, []);

  if (!staleEnoughToShow) return null;
  const parts: string[] = [];
  if (newTransactionCount > 0) parts.push(`${newTransactionCount} new transaction${newTransactionCount === 1 ? "" : "s"}`);
  if (newDebtPaymentCount > 0) parts.push(`${newDebtPaymentCount} debt payment${newDebtPaymentCount === 1 ? "" : "s"}`);
  if (netDelta !== 0) parts.push(`${netDelta > 0 ? "+" : "−"}${formatCurrency(Math.abs(netDelta))} net`);
  if (parts.length === 0 && syncErrors.length === 0) return null;

  return (
    <p className="text-sm text-muted-foreground">
      Since {relativeTimeFrom(lastVisitAt)}: <span className="text-foreground">{parts.join(" · ")}</span>
      {syncErrors.length > 0 && <span className="text-amber-400"> · {syncErrors.length} sync {syncErrors.length === 1 ? "issue" : "issues"}</span>}
    </p>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/client/api";
import { formatCurrency } from "@/lib/utils/format";

type Match = {
  id: string;
  date: string;
  amount: number;
  description: string;
  merchant: string | null;
  bankTransactionId: string | null;
};

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

export function LogPaymentDialog({
  debtId,
  creditorName,
  minimumPayment,
}: {
  debtId: string;
  creditorName: string;
  minimumPayment: number; // cents
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [amount, setAmount] = useState((minimumPayment / 100).toFixed(2));
  const [date, setDate] = useState(todayIso());
  const [type, setType] = useState<"minimum" | "extra" | "lump_sum">("minimum");
  const [notes, setNotes] = useState("");

  const [match, setMatch] = useState<Match | null>(null);
  const [matchSearched, setMatchSearched] = useState(false);
  const [matchLoading, setMatchLoading] = useState(false);
  const [linkMatch, setLinkMatch] = useState(true);

  const reset = () => {
    setAmount((minimumPayment / 100).toFixed(2));
    setDate(todayIso());
    setType("minimum");
    setNotes("");
    setMatch(null);
    setMatchSearched(false);
    setLinkMatch(true);
  };

  // Search for a matching Teller transaction whenever amount or date changes
  useEffect(() => {
    if (!open) return;
    const numericAmount = parseFloat(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setMatch(null);
      setMatchSearched(false);
      return;
    }
    let cancelled = false;
    setMatchLoading(true);
    const run = async () => {
      try {
        const res = await apiFetch(
          `/api/debts/payment/match?debtId=${encodeURIComponent(debtId)}&amount=${numericAmount}&date=${date}`,
        );
        const data = await res.json();
        if (cancelled) return;
        setMatch(data.match ?? null);
        setMatchSearched(true);
      } catch {
        if (!cancelled) {
          setMatch(null);
          setMatchSearched(true);
        }
      } finally {
        if (!cancelled) setMatchLoading(false);
      }
    };
    const t = setTimeout(run, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, debtId, amount, date]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = parseFloat(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error("Enter a positive amount");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch("/api/debts/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          debtId,
          amount: numericAmount,
          date,
          type,
          notes: notes.trim() || undefined,
          linkedTransactionId: match && linkMatch ? match.id : null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Failed to log payment");
        return;
      }
      const linkedNote = match && linkMatch ? " · linked to bank transaction" : "";
      toast.success(
        data.paidOff
          ? `${creditorName} paid off!${linkedNote}`
          : `Payment logged · balance ${formatCurrency(data.newBalance)}${linkedNote}`,
      );
      setOpen(false);
      reset();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            Log payment
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log payment — {creditorName}</DialogTitle>
          <DialogDescription>
            Record a payment you&apos;ve made. The current balance updates
            automatically. If a matching bank transaction exists, we&apos;ll link
            them.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Amount</label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Date</label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as "minimum" | "extra" | "lump_sum")}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="minimum">Minimum</option>
              <option value="extra">Extra (above minimum)</option>
              <option value="lump_sum">Lump sum</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
            <Input
              type="text"
              placeholder="e.g. paid through bank's bill pay"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Match preview */}
          <div className="rounded-md border border-input p-3 text-xs space-y-1">
            {matchLoading && <div className="text-muted-foreground">Searching for matching bank transaction…</div>}
            {!matchLoading && match && (
              <>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={linkMatch}
                    onChange={(e) => setLinkMatch(e.target.checked)}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="font-medium">
                      Auto-link to:{" "}
                      <span className="text-foreground">{match.merchant ?? match.description}</span>
                    </div>
                    <div className="text-muted-foreground mt-0.5">
                      {formatCurrency(match.amount)} · {match.date}
                      {match.bankTransactionId ? " · from bank sync" : ""}
                    </div>
                  </div>
                </label>
              </>
            )}
            {!matchLoading && matchSearched && !match && (
              <div className="text-muted-foreground">No matching bank transaction found within ±7 days. The payment will be logged as standalone.</div>
            )}
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Logging…" : "Log payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

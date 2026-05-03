"use client";

import { useState } from "react";
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

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

export function LogTaxPaymentDialog({
  obligationId,
  agency,
  taxYear,
  remainingBalance,
  installmentAmount,
}: {
  obligationId: string;
  agency: string;
  taxYear: number;
  remainingBalance: number; // cents
  installmentAmount: number | null; // cents — used as default if present
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const defaultAmount =
    installmentAmount && installmentAmount > 0 ? (installmentAmount / 100).toFixed(2) : "";

  const [amount, setAmount] = useState(defaultAmount);
  const [date, setDate] = useState(todayIso());
  const [method, setMethod] = useState<"direct_pay" | "eftps" | "check" | "payroll_deduction" | "other">("direct_pay");
  const [confirmation, setConfirmation] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setAmount(defaultAmount);
    setDate(todayIso());
    setMethod("direct_pay");
    setConfirmation("");
    setNotes("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = parseFloat(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error("Enter a positive amount");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch("/api/taxes/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          obligationId,
          amount: numericAmount,
          date,
          method,
          confirmationNumber: confirmation.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Failed to log payment");
        return;
      }
      toast.success(
        data.paidOff
          ? `${agency} ${taxYear} paid off!`
          : `Payment logged · remaining ${formatCurrency(data.remainingBalance)}`,
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
          <DialogTitle>Log tax payment — {agency} {taxYear}</DialogTitle>
          <DialogDescription>
            Record a payment toward this obligation. Remaining balance updates
            automatically. Currently {formatCurrency(remainingBalance)} left.
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
                placeholder="0.00"
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
            <label className="text-xs font-medium text-muted-foreground">Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="direct_pay">IRS Direct Pay</option>
              <option value="eftps">EFTPS</option>
              <option value="check">Check</option>
              <option value="payroll_deduction">Payroll deduction</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Confirmation # (optional)</label>
            <Input
              type="text"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
            <Input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
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

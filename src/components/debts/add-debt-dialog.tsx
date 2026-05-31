"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";

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

const DEBT_TYPES: { value: string; label: string }[] = [
  { value: "credit_card", label: "Credit card" },
  { value: "auto_loan", label: "Auto loan" },
  { value: "personal_loan", label: "Personal loan" },
  { value: "student_loan", label: "Student loan" },
  { value: "medical", label: "Medical" },
  { value: "tax_debt", label: "Tax debt" },
  { value: "other", label: "Other" },
];

export function AddDebtDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [creditorName, setCreditorName] = useState("");
  const [type, setType] = useState("credit_card");
  const [originalBalance, setOriginalBalance] = useState("");
  const [currentBalance, setCurrentBalance] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [minimumPayment, setMinimumPayment] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [notes, setNotes] = useState("");

  const isCard = type === "credit_card";

  const reset = () => {
    setCreditorName("");
    setType("credit_card");
    setOriginalBalance("");
    setCurrentBalance("");
    setInterestRate("");
    setMinimumPayment("");
    setCreditLimit("");
    setDueDay("");
    setNotes("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creditorName.trim()) {
      toast.error("Creditor name is required");
      return;
    }
    const original = parseFloat(originalBalance);
    if (!Number.isFinite(original) || original <= 0) {
      toast.error("Original balance must be positive");
      return;
    }
    const current = currentBalance.trim() ? parseFloat(currentBalance) : undefined;
    if (current !== undefined && (!Number.isFinite(current) || current < 0)) {
      toast.error("Current balance must be zero or positive");
      return;
    }
    const rate = parseFloat(interestRate);
    if (!Number.isFinite(rate) || rate < 0) {
      toast.error("Interest rate must be zero or positive");
      return;
    }
    const min = parseFloat(minimumPayment);
    if (!Number.isFinite(min) || min < 0) {
      toast.error("Minimum payment must be zero or positive");
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        creditorName: creditorName.trim(),
        type,
        originalBalance: original,
        interestRate: rate,
        minimumPayment: min,
      };
      if (current !== undefined) body.currentBalance = current;
      if (isCard && creditLimit.trim()) {
        const limit = parseFloat(creditLimit);
        if (Number.isFinite(limit) && limit > 0) body.creditLimit = limit;
      }
      if (dueDay.trim()) {
        const day = parseInt(dueDay, 10);
        if (Number.isFinite(day) && day >= 1 && day <= 31) body.dueDay = day;
      }
      if (notes.trim()) body.notes = notes.trim();

      const res = await apiFetch("/api/debts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Failed to add debt");
        return;
      }
      toast.success("Debt added");
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
          <Button size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add debt
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add debt</DialogTitle>
          <DialogDescription>
            Track a credit card, loan, or other debt. Set the credit limit on cards so utilization
            shows up in your credit score levers.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Creditor name</label>
              <Input
                type="text"
                placeholder="Apple Card (GS Bank)"
                value={creditorName}
                onChange={(e) => setCreditorName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {DEBT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">APR (%)</label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="21.99"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Original balance</label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={originalBalance}
                onChange={(e) => setOriginalBalance(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Current (optional)</label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="defaults to original"
                value={currentBalance}
                onChange={(e) => setCurrentBalance(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Minimum payment</label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={minimumPayment}
                onChange={(e) => setMinimumPayment(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Due day (1-31, optional)</label>
              <Input
                type="number"
                inputMode="numeric"
                min="1"
                max="31"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
              />
            </div>
          </div>

          {isCard && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Credit limit (required for utilization tracking)
              </label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
              />
            </div>
          )}

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
              {submitting ? "Adding…" : "Add debt"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

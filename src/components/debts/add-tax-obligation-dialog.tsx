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

const TAX_TYPES: { value: string; label: string }[] = [
  { value: "federal_income", label: "Federal income" },
  { value: "state_income", label: "State income" },
  { value: "back_taxes", label: "Back taxes" },
  { value: "estimated_quarterly", label: "Estimated quarterly" },
  { value: "penalty", label: "Penalty" },
  { value: "other", label: "Other" },
];

export function AddTaxObligationDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const currentYear = new Date().getFullYear();

  const [type, setType] = useState("back_taxes");
  const [taxYear, setTaxYear] = useState(String(currentYear - 1));
  const [originalAmount, setOriginalAmount] = useState("");
  const [remainingBalance, setRemainingBalance] = useState("");
  const [agency, setAgency] = useState("IRS");
  const [dueDate, setDueDate] = useState("");
  const [isInstallment, setIsInstallment] = useState(false);
  const [installmentAmount, setInstallmentAmount] = useState("");
  const [installmentDay, setInstallmentDay] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setType("back_taxes");
    setTaxYear(String(currentYear - 1));
    setOriginalAmount("");
    setRemainingBalance("");
    setAgency("IRS");
    setDueDate("");
    setIsInstallment(false);
    setInstallmentAmount("");
    setInstallmentDay("");
    setNotes("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const original = parseFloat(originalAmount);
    if (!Number.isFinite(original) || original <= 0) {
      toast.error("Original amount must be positive");
      return;
    }
    const remaining = remainingBalance.trim() ? parseFloat(remainingBalance) : undefined;
    if (remaining !== undefined && (!Number.isFinite(remaining) || remaining < 0)) {
      toast.error("Remaining balance must be zero or positive");
      return;
    }
    const yearNum = parseInt(taxYear, 10);
    if (!Number.isFinite(yearNum)) {
      toast.error("Enter a valid tax year");
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        type,
        taxYear: yearNum,
        originalAmount: original,
        agency: agency.trim(),
      };
      if (remaining !== undefined) body.remainingBalance = remaining;
      if (dueDate) body.dueDate = dueDate;
      if (isInstallment) {
        body.isInstallmentPlan = true;
        const inst = parseFloat(installmentAmount);
        if (Number.isFinite(inst) && inst >= 0) body.installmentAmount = inst;
        const day = parseInt(installmentDay, 10);
        if (Number.isFinite(day) && day >= 1 && day <= 31) body.installmentDay = day;
      }
      if (notes.trim()) body.notes = notes.trim();

      const res = await apiFetch("/api/taxes/obligation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Failed to add tax obligation");
        return;
      }
      toast.success("Tax obligation added");
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
            <Plus className="w-4 h-4 mr-2" />
            Add tax obligation
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add tax obligation</DialogTitle>
          <DialogDescription>
            Track a tax debt or upcoming filing. The dashboard&apos;s tax card
            will reflect this on next render.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {TAX_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Tax year</label>
              <Input
                type="number"
                inputMode="numeric"
                value={taxYear}
                onChange={(e) => setTaxYear(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Original amount</label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={originalAmount}
                onChange={(e) => setOriginalAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Remaining (optional)</label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="defaults to original"
                value={remainingBalance}
                onChange={(e) => setRemainingBalance(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Agency</label>
              <Input
                type="text"
                placeholder="IRS"
                value={agency}
                onChange={(e) => setAgency(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Due date (optional)</label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-start gap-2 rounded-md border border-input p-3">
            <input
              type="checkbox"
              checked={isInstallment}
              onChange={(e) => setIsInstallment(e.target.checked)}
              className="mt-0.5"
            />
            <div className="text-xs flex-1">
              <div className="font-medium">On an installment plan</div>
              <div className="text-muted-foreground mt-0.5">Track monthly amount + day-of-month</div>
            </div>
          </label>

          {isInstallment && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Installment amount</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={installmentAmount}
                  onChange={(e) => setInstallmentAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Day of month</label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="31"
                  value={installmentDay}
                  onChange={(e) => setInstallmentDay(e.target.value)}
                />
              </div>
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
              {submitting ? "Adding…" : "Add obligation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

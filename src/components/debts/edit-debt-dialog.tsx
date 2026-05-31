"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";

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

const STATUSES: { value: string; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "paid_off", label: "Paid off" },
  { value: "in_collections", label: "In collections" },
  { value: "deferred", label: "Deferred" },
];

type Props = {
  debt: {
    id: string;
    creditorName: string;
    type: string;
    currentBalance: number;
    originalBalance: number;
    interestRate: number;
    minimumPayment: number;
    dueDay: number | null;
    creditLimit: number | null;
    status: string;
    notes: string | null;
    nextActionDeadline: string | null;
    nextActionAmount: number | null;
    nextActionNote: string | null;
  };
};

const c2d = (cents: number) => (cents / 100).toFixed(2);

export function EditDebtDialog({ debt }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [creditorName, setCreditorName] = useState(debt.creditorName);
  const [type, setType] = useState(debt.type);
  const [status, setStatus] = useState(debt.status);
  const [originalBalance, setOriginalBalance] = useState(c2d(debt.originalBalance));
  const [currentBalance, setCurrentBalance] = useState(c2d(debt.currentBalance));
  const [interestRate, setInterestRate] = useState((debt.interestRate * 100).toFixed(2));
  const [minimumPayment, setMinimumPayment] = useState(c2d(debt.minimumPayment));
  const [creditLimit, setCreditLimit] = useState(debt.creditLimit !== null ? c2d(debt.creditLimit) : "");
  const [dueDay, setDueDay] = useState(debt.dueDay !== null ? String(debt.dueDay) : "");
  const [notes, setNotes] = useState(debt.notes ?? "");

  const [deadline, setDeadline] = useState(debt.nextActionDeadline ?? "");
  const [deadlineAmount, setDeadlineAmount] = useState(
    debt.nextActionAmount !== null ? c2d(debt.nextActionAmount) : "",
  );
  const [deadlineNote, setDeadlineNote] = useState(debt.nextActionNote ?? "");

  const isCard = type === "credit_card";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creditorName.trim()) {
      toast.error("Creditor name is required");
      return;
    }

    const body: Record<string, unknown> = {
      creditorName: creditorName.trim(),
      type,
      status,
      originalBalance: parseFloat(originalBalance),
      currentBalance: parseFloat(currentBalance),
      interestRate: parseFloat(interestRate),
      minimumPayment: parseFloat(minimumPayment),
      dueDay: dueDay.trim() ? parseInt(dueDay, 10) : null,
      creditLimit: isCard && creditLimit.trim() ? parseFloat(creditLimit) : null,
      notes: notes.trim() || null,
      nextActionDeadline: deadline || null,
      nextActionAmount: deadlineAmount.trim() ? parseFloat(deadlineAmount) : null,
      nextActionNote: deadlineNote.trim() || null,
    };

    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/debts/${debt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Failed to update debt");
        return;
      }
      toast.success("Debt updated");
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm" className="h-8 px-2">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {debt.creditorName}</DialogTitle>
          <DialogDescription>
            Update the debt's details, status, or next-action deadline.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Creditor name</label>
              <Input value={creditorName} onChange={(e) => setCreditorName(e.target.value)} required />
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
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Original balance</label>
              <Input
                type="number" inputMode="decimal" step="0.01" min="0"
                value={originalBalance} onChange={(e) => setOriginalBalance(e.target.value)} required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Current balance</label>
              <Input
                type="number" inputMode="decimal" step="0.01" min="0"
                value={currentBalance} onChange={(e) => setCurrentBalance(e.target.value)} required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">APR (%)</label>
              <Input
                type="number" inputMode="decimal" step="0.01" min="0"
                value={interestRate} onChange={(e) => setInterestRate(e.target.value)} required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Minimum payment</label>
              <Input
                type="number" inputMode="decimal" step="0.01" min="0"
                value={minimumPayment} onChange={(e) => setMinimumPayment(e.target.value)} required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {isCard && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Credit limit</label>
                <Input
                  type="number" inputMode="decimal" step="0.01" min="0"
                  placeholder="for utilization tracking"
                  value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Due day (1-31)</label>
              <Input
                type="number" inputMode="numeric" min="1" max="31"
                value={dueDay} onChange={(e) => setDueDay(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="rounded-md border border-input p-3 space-y-3">
            <p className="text-xs font-medium">Next-action deadline (optional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Date</label>
                <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Amount</label>
                <Input
                  type="number" inputMode="decimal" step="0.01" min="0"
                  value={deadlineAmount} onChange={(e) => setDeadlineAmount(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">What happens if you miss it?</label>
              <Input
                placeholder="Pay this to avoid late fee / score drop / etc."
                value={deadlineNote} onChange={(e) => setDeadlineNote(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

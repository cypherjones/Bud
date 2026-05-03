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

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

export function LogCreditScoreDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [score, setScore] = useState("");
  const [bureau, setBureau] = useState<"" | "equifax" | "experian" | "transunion" | "fico" | "vantage">("");
  const [source, setSource] = useState("");
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState("");

  const [includeFactors, setIncludeFactors] = useState(false);
  const [utilizationPct, setUtilizationPct] = useState("");
  const [onTimePayments, setOnTimePayments] = useState("");
  const [totalAccounts, setTotalAccounts] = useState("");
  const [hardInquiries, setHardInquiries] = useState("");
  const [oldestAccountMonths, setOldestAccountMonths] = useState("");
  const [derogatoryMarks, setDerogatoryMarks] = useState("");
  const [totalBalance, setTotalBalance] = useState("");
  const [totalCreditLimit, setTotalCreditLimit] = useState("");

  const reset = () => {
    setScore("");
    setBureau("");
    setSource("");
    setDate(todayIso());
    setNotes("");
    setIncludeFactors(false);
    setUtilizationPct("");
    setOnTimePayments("");
    setTotalAccounts("");
    setHardInquiries("");
    setOldestAccountMonths("");
    setDerogatoryMarks("");
    setTotalBalance("");
    setTotalCreditLimit("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericScore = parseInt(score, 10);
    if (!Number.isFinite(numericScore) || numericScore < 300 || numericScore > 850) {
      toast.error("Score must be between 300 and 850");
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        score: numericScore,
        date,
      };
      if (bureau) body.bureau = bureau;
      if (source.trim()) body.source = source.trim();
      if (notes.trim()) body.notes = notes.trim();

      if (includeFactors) {
        const factors: Record<string, unknown> = {};
        const u = parseFloat(utilizationPct);
        if (Number.isFinite(u) && u >= 0 && u <= 100) factors.utilizationRatio = u;
        const otp = parseInt(onTimePayments, 10);
        if (Number.isFinite(otp) && otp >= 0) factors.onTimePayments = otp;
        const ta = parseInt(totalAccounts, 10);
        if (Number.isFinite(ta) && ta >= 0) factors.totalAccounts = ta;
        const hi = parseInt(hardInquiries, 10);
        if (Number.isFinite(hi) && hi >= 0) factors.hardInquiries = hi;
        const oam = parseInt(oldestAccountMonths, 10);
        if (Number.isFinite(oam) && oam >= 0) factors.oldestAccountMonths = oam;
        const dm = parseInt(derogatoryMarks, 10);
        if (Number.isFinite(dm) && dm >= 0) factors.derogatoryMarks = dm;
        const tb = parseFloat(totalBalance);
        if (Number.isFinite(tb) && tb >= 0) factors.totalBalance = tb;
        const tcl = parseFloat(totalCreditLimit);
        if (Number.isFinite(tcl) && tcl >= 0) factors.totalCreditLimit = tcl;
        if (Object.keys(factors).length > 0) body.factors = factors;
      }

      const res = await apiFetch("/api/credit/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Failed to log score");
        return;
      }
      toast.success(`Logged credit score ${numericScore}`);
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
            Log score
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log credit score</DialogTitle>
          <DialogDescription>
            Snapshot a new credit score reading. Optionally log factors so
            utilization and other levers track over time.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Score (300–850)</label>
              <Input
                type="number"
                inputMode="numeric"
                min="300"
                max="850"
                value={score}
                onChange={(e) => setScore(e.target.value)}
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Bureau (optional)</label>
              <select
                value={bureau}
                onChange={(e) => setBureau(e.target.value as typeof bureau)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">—</option>
                <option value="equifax">Equifax</option>
                <option value="experian">Experian</option>
                <option value="transunion">TransUnion</option>
                <option value="fico">FICO (general)</option>
                <option value="vantage">VantageScore</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Source (optional)</label>
              <Input
                type="text"
                placeholder="Credit Karma, bank app, etc."
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
            <Input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <label className="flex items-start gap-2 rounded-md border border-input p-3">
            <input
              type="checkbox"
              checked={includeFactors}
              onChange={(e) => setIncludeFactors(e.target.checked)}
              className="mt-0.5"
            />
            <div className="text-xs flex-1">
              <div className="font-medium">Also log factors snapshot</div>
              <div className="text-muted-foreground mt-0.5">
                Utilization, on-time payments, total accounts, etc. — fills in the factors panel on /credit.
              </div>
            </div>
          </label>

          {includeFactors && (
            <div className="rounded-md border border-input p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Utilization %</label>
                  <Input type="number" inputMode="decimal" step="0.1" min="0" max="100" value={utilizationPct} onChange={(e) => setUtilizationPct(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">On-time payments (months)</label>
                  <Input type="number" inputMode="numeric" min="0" value={onTimePayments} onChange={(e) => setOnTimePayments(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Total accounts</label>
                  <Input type="number" inputMode="numeric" min="0" value={totalAccounts} onChange={(e) => setTotalAccounts(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Hard inquiries (24mo)</label>
                  <Input type="number" inputMode="numeric" min="0" value={hardInquiries} onChange={(e) => setHardInquiries(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Oldest account (months)</label>
                  <Input type="number" inputMode="numeric" min="0" value={oldestAccountMonths} onChange={(e) => setOldestAccountMonths(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Derogatory marks</label>
                  <Input type="number" inputMode="numeric" min="0" value={derogatoryMarks} onChange={(e) => setDerogatoryMarks(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Total balance ($)</label>
                  <Input type="number" inputMode="decimal" step="0.01" min="0" value={totalBalance} onChange={(e) => setTotalBalance(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Total credit limit ($)</label>
                  <Input type="number" inputMode="decimal" step="0.01" min="0" value={totalCreditLimit} onChange={(e) => setTotalCreditLimit(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Logging…" : "Log score"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

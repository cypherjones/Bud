"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/client/api";

type Account = {
  id: string;
  name: string;
  institution: string;
  lastFour: string | null;
  tellerAccountId: string | null;
};

type Category = {
  id: string;
  name: string;
  groupName?: string | null;
  groupSort?: number | null;
};

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

export function AddTransactionDialog({
  accounts,
  categories,
}: {
  accounts: Account[];
  categories: Category[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [placeholder, setPlaceholder] = useState(true);

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const placeholderApplicable = !!selectedAccount?.tellerAccountId;

  const reset = () => {
    setAmount("");
    setDescription("");
    setCategoryId("");
    setDate(todayIso());
    setType("expense");
    setPlaceholder(true);
    setAccountId(accounts[0]?.id ?? "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = parseFloat(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error("Enter a positive amount");
      return;
    }
    if (!description.trim()) {
      toast.error("Description is required");
      return;
    }
    if (!accountId) {
      toast.error("Pick an account");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          amount: numericAmount,
          type,
          description: description.trim(),
          date,
          categoryId: categoryId || undefined,
          placeholder: placeholderApplicable && placeholder,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Failed to add transaction");
        return;
      }
      toast.success(
        data.placeholder
          ? "Added — will auto-resolve on next sync"
          : "Transaction added",
      );
      setOpen(false);
      reset();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  // Group categories by parent for the dropdown
  const grouped = new Map<string, Category[]>();
  const ungrouped: Category[] = [];
  for (const c of categories) {
    if (c.groupName) {
      if (!grouped.has(c.groupName)) grouped.set(c.groupName, []);
      grouped.get(c.groupName)!.push(c);
    } else {
      ungrouped.push(c);
    }
  }
  const groupedSorted = [...grouped.entries()].sort((a, b) => {
    const aSort = a[1][0]?.groupSort ?? 99;
    const bSort = b[1][0]?.groupSort ?? 99;
    return aSort - bSort;
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="default" size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add transaction
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add transaction</DialogTitle>
          <DialogDescription>
            Log a transaction manually. For bank-connected accounts, leave the
            placeholder option on so it auto-resolves when Teller catches up.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Account</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.institution} · {a.name}
                  {a.lastFour ? ` (····${a.lastFour})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as "income" | "expense")}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
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

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Input
              type="text"
              placeholder="What is this for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Auto-detect from description</option>
              {groupedSorted.map(([groupName, cats]) => (
                <optgroup key={groupName} label={groupName}>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </optgroup>
              ))}
              {ungrouped.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <label
            className={`flex items-start gap-2 rounded-md border border-input p-3 ${
              placeholderApplicable ? "" : "opacity-50"
            }`}
          >
            <input
              type="checkbox"
              checked={placeholderApplicable && placeholder}
              onChange={(e) => setPlaceholder(e.target.checked)}
              disabled={!placeholderApplicable}
              className="mt-0.5"
            />
            <div className="text-xs">
              <div className="font-medium">Placeholder for upcoming Teller sync</div>
              <div className="text-muted-foreground mt-0.5">
                {placeholderApplicable
                  ? "Auto-replaced when the next sync brings in a matching transaction. Expires in 14 days if no match."
                  : "This account is not connected to Teller, so placeholders don't apply."}
              </div>
            </div>
          </label>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding..." : "Add transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

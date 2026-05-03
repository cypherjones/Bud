"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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

type LinkableTransaction = {
  id: string;
  date: string;
  amount: number;
  description: string;
  merchant: string | null;
  accountName: string | null;
  accountSubtype: string | null;
};

function shortDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function LinkContributionDialog({
  goalId,
  goalName,
  candidates,
}: {
  goalId: string;
  goalName: string;
  candidates: LinkableTransaction[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);

  const onLink = async (txnId: string) => {
    setLinking(txnId);
    try {
      const res = await apiFetch("/api/goals/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: txnId, goalId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Failed to link");
        return;
      }
      toast.success(`Linked to ${goalName}`);
      router.refresh();
      setOpen(false);
    } finally {
      setLinking(null);
    }
  };

  // Highlight savings-account candidates first since those are the most likely real contributions.
  const sorted = [...candidates].sort((a, b) => {
    const as = a.accountSubtype === "savings" ? 0 : 1;
    const bs = b.accountSubtype === "savings" ? 0 : 1;
    if (as !== bs) return as - bs;
    return b.date.localeCompare(a.date);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Link2 className="w-3.5 h-3.5 mr-1.5" />
            Link contribution
          </Button>
        }
      />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Link a contribution to {goalName}</DialogTitle>
          <DialogDescription>
            Income transactions not yet tied to any goal. Savings-account
            inflows are listed first. Linking adds the amount to the goal&apos;s
            current saved balance.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-96 overflow-auto space-y-1.5">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No unlinked income transactions on file.
            </p>
          ) : (
            sorted.map((c) => (
              <button
                key={c.id}
                disabled={linking !== null}
                onClick={() => onLink(c.id)}
                className="w-full text-left rounded-md border border-input hover:bg-accent transition-colors p-3 text-sm flex items-start justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{c.merchant ?? c.description}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {shortDate(c.date)}
                    {c.accountName ? ` · ${c.accountName}` : ""}
                    {c.accountSubtype === "savings" ? " · savings" : ""}
                  </div>
                </div>
                <span className="font-semibold whitespace-nowrap">{formatCurrency(c.amount)}</span>
              </button>
            ))
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

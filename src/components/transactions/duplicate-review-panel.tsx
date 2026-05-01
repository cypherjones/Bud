"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/client/api";
import { formatCurrency } from "@/lib/utils/format";

type Candidate = {
  accountId: string;
  accountName: string;
  date: string;
  amount: number;
  description: string;
  rows: {
    id: string;
    bankTransactionId: string | null;
    createdAt: string;
    categoryName: string | null;
  }[];
};

export function DuplicateReviewPanel({ candidates }: { candidates: Candidate[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [merging, setMerging] = useState<string | null>(null);

  if (candidates.length === 0) return null;

  const handleMerge = async (group: Candidate, keeperId: string) => {
    const loserIds = group.rows.map((r) => r.id).filter((id) => id !== keeperId);
    if (!loserIds.length) return;

    const groupKey = `${group.accountId}|${group.date}|${group.amount}`;
    setMerging(groupKey);
    try {
      const res = await apiFetch("/api/transactions/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keeperId, loserIds }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Merge failed");
        return;
      }
      toast.success(`Merged — ${data.deleted} duplicate${data.deleted === 1 ? "" : "s"} removed`);
      router.refresh();
    } finally {
      setMerging(null);
    }
  };

  return (
    <Card className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
      <CardContent className="py-3 px-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-medium">
              {candidates.length} possible duplicate {candidates.length === 1 ? "transaction" : "transactions"} from your bank
            </span>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>

        {expanded && (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-muted-foreground">
              Same account, same date, same amount, same description — but Teller assigned multiple IDs (often happens
              when a charge transitions pending → posted). Pick the row to keep; the others will be removed and any
              tags transferred.
            </p>

            {candidates.map((group) => {
              const groupKey = `${group.accountId}|${group.date}|${group.amount}`;
              const isMerging = merging === groupKey;
              const formattedDate = new Date(group.date + "T00:00:00").toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              });

              return (
                <div
                  key={groupKey}
                  className="rounded-md border border-amber-200 bg-background/50 dark:border-amber-900/60 p-3 space-y-2"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-sm font-medium truncate">{group.description}</div>
                    <div className="text-sm font-semibold whitespace-nowrap">{formatCurrency(group.amount)}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {group.accountName} · {formattedDate}
                  </div>

                  <div className="space-y-1.5 mt-2">
                    {group.rows.map((row) => (
                      <div key={row.id} className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-muted-foreground truncate">
                            {row.bankTransactionId ?? row.id}
                          </div>
                          <div className="text-muted-foreground/70">
                            Synced{" "}
                            {new Date(row.createdAt).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                            {row.categoryName ? ` · ${row.categoryName}` : ""}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isMerging}
                          onClick={() => handleMerge(group, row.id)}
                        >
                          {isMerging ? "Merging..." : "Keep this"}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

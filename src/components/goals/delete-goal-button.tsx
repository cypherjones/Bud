"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/client/api";

/** Two presses to delete: the first asks, the second removes the goal row. */
export function DeleteGoalButton({ goalId, goalName }: { goalId: string; goalName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch(`/api/goals?id=${encodeURIComponent(goalId)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not delete the goal");
        return;
      }
      toast.success(`Deleted ${goalName}`);
      router.refresh();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {confirming && !busy && (
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          Keep
        </Button>
      )}
      <Button variant="destructive" size="sm" onClick={onClick} disabled={busy}>
        {busy ? "Deleting…" : confirming ? "Delete for good" : "Delete"}
      </Button>
    </div>
  );
}

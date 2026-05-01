"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/client/api";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type SyncResult = {
  success: boolean;
  new_transactions: number;
  updated_transactions: number;
  resolved_placeholders: number;
  errors?: string[];
};

export function SyncButton() {
  const [isSyncing, setIsSyncing] = useState(false);
  const router = useRouter();

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await apiFetch("/api/sync", { method: "POST" });
      const data = (await res.json()) as SyncResult;

      if (!data.success) {
        toast.error(data.errors?.[0] ?? "Sync failed");
      } else {
        const parts = [
          `${data.new_transactions} new`,
          data.updated_transactions ? `${data.updated_transactions} updated` : null,
          data.resolved_placeholders ? `${data.resolved_placeholders} placeholder${data.resolved_placeholders === 1 ? "" : "s"} resolved` : null,
        ].filter(Boolean);
        toast.success(parts.join(", "));
      }
      router.refresh();
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Button onClick={handleSync} disabled={isSyncing} variant="outline" size="sm">
      <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} />
      {isSyncing ? "Syncing..." : "Sync"}
    </Button>
  );
}

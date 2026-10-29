"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/client/api";

const BRIDGE = "https://beta-bridge.simplefin.org";

type SyncResponse = {
  error?: string;
  new_accounts?: number;
  new_transactions?: number;
  updated_transactions?: number;
  errors?: string[];
};

function describe(data: SyncResponse): string {
  const parts: string[] = [];
  if (data.new_accounts) parts.push(`${data.new_accounts} new ${data.new_accounts === 1 ? "account" : "accounts"}`);
  if (data.new_transactions) parts.push(`${data.new_transactions} new ${data.new_transactions === 1 ? "transaction" : "transactions"}`);
  if (data.updated_transactions) parts.push(`${data.updated_transactions} updated`);
  const head = parts.length > 0 ? `Synced: ${parts.join(", ")}.` : "Synced. Nothing new.";
  return data.errors?.length ? `${head} Problems: ${data.errors.join("; ")}` : head;
}

/**
 * The Sync now button. `allowed` comes from the server: off everywhere but
 * the production droplet, so the Mac never pulls from the banks itself.
 */
export function SyncNow({ allowed, hasConnection, refusedMessage }: { allowed: boolean; hasConnection: boolean; refusedMessage: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string; bad: boolean } | null>(null);

  const sync = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await apiFetch("/api/sync", { method: "POST" });
      const data: SyncResponse = await res.json().catch(() => ({}));
      setResult(res.ok ? { text: describe(data), bad: !!data.errors?.length } : { text: data.error ?? `Sync failed (${res.status}).`, bad: true });
      if (res.ok) router.refresh();
    } catch {
      setResult({ text: "Sync failed. The server didn't answer.", bad: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button onClick={sync} disabled={!allowed || !hasConnection || busy} variant="outline">
        <RefreshCw className={busy ? "animate-spin" : undefined} />
        {busy ? "Syncing…" : "Sync now"}
      </Button>
      {!allowed && <p className="text-sm text-muted-foreground max-w-prose">{refusedMessage}</p>}
      {allowed && !hasConnection && <p className="text-sm text-muted-foreground">Add a SimpleFIN token below first.</p>}
      {result && <p className={result.bad ? "text-sm text-red-400" : "text-sm text-muted-foreground"}>{result.text}</p>}
    </div>
  );
}

/** Claim a one-time SimpleFIN setup token. Claiming burns the token, so it is off wherever sync is off. */
export function AddSimplefinToken({ allowed, hasConnection }: { allowed: boolean; hasConnection: boolean }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const connect = async () => {
    if (!token.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/settings/simplefin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setup_token: token.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not claim that token.");
        return;
      }
      setToken("");
      setDone(true);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="rounded-xl border border-border bg-card">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">Add a SimpleFIN token</summary>
      <div className="space-y-3 border-t border-border px-4 py-3 text-sm">
        <p className="text-muted-foreground">
          {hasConnection
            ? "Banks are added and removed in SimpleFIN Bridge, not here. Only paste a token to connect a second SimpleFIN account."
            : "Bud reads your banks through SimpleFIN Bridge. Connect the banks there, then paste the one-time setup token here. Your bank logins never reach Bud."}
        </p>
        <a href={BRIDGE} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
          Open SimpleFIN Bridge <ExternalLink className="size-3" />
        </a>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={!allowed}
            placeholder="Paste a SimpleFIN setup token"
            aria-label="SimpleFIN setup token"
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          />
          <Button onClick={connect} disabled={!allowed || busy || !token.trim()}>
            {busy ? "Connecting…" : "Connect"}
          </Button>
        </div>
        {!allowed && <p className="text-muted-foreground">Off on this machine. A setup token works once, so claim it on the production server.</p>}
        {error && <p className="text-red-400">{error}</p>}
        {done && <p className="text-emerald-400">Connected. Press Sync now to pull the accounts.</p>}
      </div>
    </details>
  );
}

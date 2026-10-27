"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Link2, CheckCircle, Building2, ExternalLink } from "lucide-react";
import { apiFetch } from "@/lib/client/api";

type Connection = {
  id: string;
  name: string;
  lastSynced: string | null;
  createdAt: string;
};

export default function SettingsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [setupToken, setSetupToken] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const loadConnections = () => {
    apiFetch("/api/settings/simplefin")
      .then((r) => r.json())
      .then((data) => {
        if (data.connections) setConnections(data.connections);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadConnections();
  }, []);

  const handleConnect = async () => {
    if (!setupToken.trim()) return;
    setIsConnecting(true);
    setConnectError(null);
    try {
      const res = await apiFetch("/api/settings/simplefin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setup_token: setupToken.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setSetupToken("");
        loadConnections();
        handleSync();
      } else {
        setConnectError(data.error ?? "Failed to connect");
      }
    } catch {
      setConnectError("Failed to connect — check console for details");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await apiFetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        const parts = [];
        if (data.new_accounts > 0) parts.push(`${data.new_accounts} new accounts`);
        if (data.new_transactions > 0) parts.push(`${data.new_transactions} new transactions`);
        if (data.updated_transactions > 0) parts.push(`${data.updated_transactions} updated`);
        setSyncResult(parts.length > 0 ? `Synced: ${parts.join(", ")}` : "Everything up to date");
        if (data.errors) {
          setSyncResult((prev) => `${prev} (errors: ${data.errors.join("; ")})`);
        }
        loadConnections();
      } else {
        setSyncResult(`Error: ${data.error}`);
      }
    } catch {
      setSyncResult("Sync failed — check console for details");
    }
    setIsSyncing(false);
  };

  return (
    <div className="flex flex-col h-full">
      <header className="px-8 py-6 border-b border-border bg-card/50">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure bank sync and preferences
        </p>
      </header>

      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-2xl space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-primary" />
                  Bank Sync (SimpleFIN)
                </CardTitle>
                {connections.length > 0 && (
                  <Badge variant="secondary" className="bg-green-100 text-green-700">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Connected
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {connections.length > 0 && (
                <div className="space-y-2">
                  {connections.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-md border px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{c.name}</span>
                      </div>
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        {c.lastSynced
                          ? `Last synced ${new Date(c.lastSynced).toLocaleString()}`
                          : "Never synced"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              {connections.length > 0 && (
                <Button onClick={handleSync} disabled={isSyncing} variant="outline">
                  <RefreshCw
                    className={`w-4 h-4 mr-2 ${isSyncing ? "animate-spin" : ""}`}
                  />
                  {isSyncing ? "Syncing..." : "Sync All"}
                </Button>
              )}

              <div className="space-y-2 pt-2">
                <p className="text-sm text-muted-foreground">
                  {connections.length > 0
                    ? "To add or manage banks, log in to SimpleFIN Bridge. To connect a second SimpleFIN account, paste a new setup token below."
                    : "Bud syncs transactions through SimpleFIN Bridge ($15/yr). Create an account, connect your banks there, then paste your one-time setup token below. Your bank credentials never touch Bud."}
                </p>
                <a
                  href="https://beta-bridge.simplefin.org"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  Open SimpleFIN Bridge <ExternalLink className="w-3 h-3" />
                </a>
                <div className="flex items-center gap-3">
                  <input
                    type="password"
                    value={setupToken}
                    onChange={(e) => setSetupToken(e.target.value)}
                    placeholder="Paste SimpleFIN setup token"
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <Button
                    onClick={handleConnect}
                    disabled={isConnecting || !setupToken.trim()}
                  >
                    {isConnecting ? "Connecting..." : "Connect"}
                  </Button>
                </div>
                {connectError && (
                  <p className="text-sm text-red-600">{connectError}</p>
                )}
              </div>

              {syncResult && (
                <p className="text-sm text-muted-foreground">{syncResult}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Link2, CheckCircle } from "lucide-react";

export default function SettingsPage() {
  const [accessToken, setAccessToken] = useState("");
  const [enrollmentId, setEnrollmentId] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  useEffect(() => {
    // Check if Teller is configured
    fetch("/api/settings/teller")
      .then((r) => r.json())
      .then((data) => {
        if (data.connected) setIsConnected(true);
      })
      .catch(() => {});
  }, []);

  const handleSaveToken = async () => {
    const res = await fetch("/api/settings/teller", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: accessToken, enrollment_id: enrollmentId }),
    });
    if (res.ok) {
      setIsConnected(true);
      setAccessToken("");
      setEnrollmentId("");
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSyncResult(
          `Synced: ${data.new_transactions} new transactions, ${data.updated_transactions} updated, ${data.new_accounts} new accounts`
        );
      } else {
        setSyncResult(`Error: ${data.error}`);
      }
    } catch {
      setSyncResult("Sync failed — check console for details");
    }
    setIsSyncing(false);
  };

  return (
    <div className="flex flex-col h-screen">
      <header className="px-8 py-6 border-b border-border bg-card/50">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure bank sync and preferences
        </p>
      </header>

      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-2xl space-y-6">
          {/* Teller Connection */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-primary" />
                  Bank Connection (Teller)
                </CardTitle>
                {isConnected && (
                  <Badge variant="secondary" className="bg-green-100 text-green-700">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Connected
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isConnected ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Connect your bank via Teller to automatically sync
                    transactions. You&apos;ll need your Teller access token from
                    the enrollment process.
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium">Access Token</label>
                      <Input
                        type="password"
                        placeholder="token_xxx..."
                        value={accessToken}
                        onChange={(e) => setAccessToken(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">
                        Enrollment ID
                      </label>
                      <Input
                        placeholder="enr_xxx..."
                        value={enrollmentId}
                        onChange={(e) => setEnrollmentId(e.target.value)}
                      />
                    </div>
                    <Button
                      onClick={handleSaveToken}
                      disabled={!accessToken}
                    >
                      Save & Connect
                    </Button>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Your bank is connected. Transactions sync automatically
                    every 6 hours, or sync manually below.
                  </p>
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={handleSync}
                      disabled={isSyncing}
                      variant="outline"
                    >
                      <RefreshCw
                        className={`w-4 h-4 mr-2 ${isSyncing ? "animate-spin" : ""}`}
                      />
                      {isSyncing ? "Syncing..." : "Sync Now"}
                    </Button>
                  </div>
                  {syncResult && (
                    <p className="text-sm text-muted-foreground">{syncResult}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

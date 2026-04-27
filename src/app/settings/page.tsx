"use client";

import { useState, useEffect, useRef } from "react";
import Script from "next/script";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Link2, CheckCircle, Building2 } from "lucide-react";
import { apiFetch } from "@/lib/client/api";

declare global {
  interface Window {
    TellerConnect: {
      setup(config: {
        applicationId: string;
        products: string[];
        environment?: string;
        onSuccess(enrollment: {
          accessToken: string;
          enrollment: { id: string; institution: { name: string } };
        }): void;
        onExit?(): void;
      }): { open(): void };
    };
  }
}

export default function SettingsPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const tellerRef = useRef<{ open(): void } | null>(null);

  useEffect(() => {
    apiFetch("/api/settings/teller")
      .then((r) => r.json())
      .then((data) => {
        if (data.connected) setIsConnected(true);
      })
      .catch(() => {});
  }, []);

  const initTellerConnect = () => {
    if (!window.TellerConnect) return;

    tellerRef.current = window.TellerConnect.setup({
      applicationId: process.env.NEXT_PUBLIC_TELLER_APPLICATION_ID!,
      products: ["transactions"],
      environment: process.env.NEXT_PUBLIC_TELLER_ENVIRONMENT ?? "sandbox",
      onSuccess: async (enrollment) => {
        setIsConnecting(true);
        try {
          const res = await apiFetch("/api/settings/teller", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_token: enrollment.accessToken,
              enrollment_id: enrollment.enrollment.id,
            }),
          });
          if (res.ok) {
            setIsConnected(true);
            // Auto-trigger first sync
            handleSync();
          }
        } finally {
          setIsConnecting(false);
        }
      },
      onExit: () => {
        setIsConnecting(false);
      },
    });

    setSdkReady(true);
  };

  const handleConnectBank = () => {
    if (tellerRef.current) {
      tellerRef.current.open();
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await apiFetch("/api/sync", { method: "POST" });
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
      <Script
        src="https://cdn.teller.io/connect/connect.js"
        strategy="lazyOnload"
        onReady={initTellerConnect}
      />

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
                  Bank Connection
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
                    Securely connect your bank to automatically import
                    transactions. Your credentials are handled directly by Teller
                    and never touch our servers.
                  </p>
                  <Button
                    onClick={handleConnectBank}
                    disabled={!sdkReady || isConnecting}
                  >
                    <Building2 className="w-4 h-4 mr-2" />
                    {isConnecting
                      ? "Connecting..."
                      : sdkReady
                        ? "Connect Bank"
                        : "Loading..."}
                  </Button>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Your bank is connected. Sync your latest transactions below.
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

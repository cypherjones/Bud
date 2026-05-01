"use client";

import { useState, useEffect, useRef } from "react";
import Script from "next/script";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Link2, CheckCircle, Building2, Plus } from "lucide-react";
import { apiFetch } from "@/lib/client/api";

type Enrollment = {
  id: string;
  enrollmentId: string;
  institution: string;
  createdAt: string;
};

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
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const tellerRef = useRef<{ open(): void } | null>(null);

  const loadEnrollments = () => {
    apiFetch("/api/settings/teller")
      .then((r) => r.json())
      .then((data) => {
        if (data.enrollments) setEnrollments(data.enrollments);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadEnrollments();
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
              institution: enrollment.enrollment.institution.name,
            }),
          });
          if (res.ok) {
            loadEnrollments();
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
        const parts = [];
        if (data.new_accounts > 0) parts.push(`${data.new_accounts} new accounts`);
        if (data.new_transactions > 0) parts.push(`${data.new_transactions} new transactions`);
        if (data.updated_transactions > 0) parts.push(`${data.updated_transactions} updated`);
        setSyncResult(parts.length > 0 ? `Synced: ${parts.join(", ")}` : "Everything up to date");
        if (data.errors) {
          setSyncResult((prev) => `${prev} (errors: ${data.errors.join("; ")})`);
        }
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
                  Bank Connections
                </CardTitle>
                {enrollments.length > 0 && (
                  <Badge variant="secondary" className="bg-green-100 text-green-700">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    {enrollments.length} connected
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {enrollments.length > 0 && (
                <div className="space-y-2">
                  {enrollments.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between rounded-md border px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{e.institution}</span>
                      </div>
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Connected
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button
                  onClick={handleConnectBank}
                  disabled={!sdkReady || isConnecting}
                  variant={enrollments.length > 0 ? "outline" : "default"}
                >
                  {enrollments.length > 0 ? (
                    <Plus className="w-4 h-4 mr-2" />
                  ) : (
                    <Building2 className="w-4 h-4 mr-2" />
                  )}
                  {isConnecting
                    ? "Connecting..."
                    : sdkReady
                      ? enrollments.length > 0
                        ? "Add Another Bank"
                        : "Connect Bank"
                      : "Loading..."}
                </Button>

                {enrollments.length > 0 && (
                  <Button
                    onClick={handleSync}
                    disabled={isSyncing}
                    variant="outline"
                  >
                    <RefreshCw
                      className={`w-4 h-4 mr-2 ${isSyncing ? "animate-spin" : ""}`}
                    />
                    {isSyncing ? "Syncing..." : "Sync All"}
                  </Button>
                )}
              </div>

              {enrollments.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Securely connect your banks to automatically import
                  transactions. Your credentials are handled directly by Teller
                  and never touch our servers.
                </p>
              )}

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

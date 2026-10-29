"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils/format";
import { apiFetch } from "@/lib/client/api";
import { cn } from "@/lib/utils";

type Bill = { id: string; merchant: string; amount: number; dueDate: string; daysUntil: number; category: string | null };
type Sub = { id: string; name: string; monthlyCost: number; action: "cancel" | "transfer"; transferTo?: string };

const day = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/** The next seven days from the recurring schedule, and the subscriptions waiting to be cancelled. */
export function ComingUp({ bills, killList, killListMonthly }: { bills: Bill[]; killList: Sub[]; killListMonthly: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const total = bills.reduce((s, b) => s + b.amount, 0);

  const markDone = async (s: Sub) => {
    setBusy(s.id);
    await apiFetch("/api/subscriptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, patch: { status: s.action === "transfer" ? "transferred" : "cancelled" } }),
    });
    setBusy(null);
    router.refresh();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <div className="lg:col-span-3 rounded-xl border border-border bg-card px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Next seven days · {formatCurrency(total)} across {bills.length} {bills.length === 1 ? "bill" : "bills"}
        </p>
        {bills.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nothing scheduled this week.</p>
        ) : (
          <table className="mt-1 w-full text-sm">
            <tbody>
              {bills.map((b) => {
                const soon = b.daysUntil <= 1;
                return (
                  <tr key={b.id} className="border-b border-border last:border-b-0">
                    <td className={cn("py-1.5 pr-3 whitespace-nowrap text-[13px]", soon ? "text-amber-400" : "text-muted-foreground")}>
                      {b.daysUntil === 0 ? "Today" : b.daysUntil === 1 ? "Tomorrow" : day(b.dueDate)}
                    </td>
                    <td className="py-1.5 pr-3">
                      {b.merchant}
                      {b.category && <span className="ml-2 text-[11px] text-muted-foreground">{b.category}</span>}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{formatCurrency(b.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          From the recurring schedule. <Link href="/schedule" className="underline decoration-dotted underline-offset-2">The full month</Link> is on Schedule.
        </p>
      </div>

      <div className="lg:col-span-2 rounded-xl border border-border bg-card px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Subscriptions to act on{killList.length > 0 && ` · ${formatCurrency(killListMonthly)} a month`}
        </p>
        {killList.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing waiting to be cancelled or handed off. Mark one on{" "}
            <Link href="/subscriptions" className="underline decoration-dotted underline-offset-2">Subscriptions</Link>.
          </p>
        ) : (
          <table className="mt-1 w-full text-sm">
            <tbody>
              {killList.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-b-0">
                  <td className="py-1.5 pr-2 w-6">
                    <button
                      onClick={() => markDone(s)}
                      disabled={busy === s.id}
                      title={s.action === "transfer" ? "Mark handed off" : "Mark cancelled"}
                      aria-label={`Mark ${s.name} ${s.action === "transfer" ? "handed off" : "cancelled"}`}
                      className="h-4 w-4 rounded border border-muted-foreground/60 hover:border-emerald-400 hover:bg-emerald-500/10"
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    {s.name}
                    <span className="ml-2 text-[11px] text-muted-foreground">
                      {s.action === "transfer" ? `hand off${s.transferTo ? ` to ${s.transferTo}` : ""}` : "cancel"}
                    </span>
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{formatCurrency(s.monthlyCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {killList.length > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Tick one once it&apos;s done. <Link href="/subscriptions" className="underline decoration-dotted underline-offset-2">All subscriptions</Link>
          </p>
        )}
      </div>
    </div>
  );
}

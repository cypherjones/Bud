"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MapPin,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  TrendingUp,
  TrendingDown,
  Lock,
  Plus,
  Trash2,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { apiFetch } from "@/lib/client/api";
import type { MoveReadiness, MoveReadinessSignal, MoveReadinessBlocker } from "@/lib/actions/move-readiness";

type Props = {
  data: MoveReadiness;
};

const STATUS_TONE: Record<MoveReadinessSignal["status"], string> = {
  good: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  warn: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  bad: "bg-red-500/15 text-red-400 border-red-500/30",
  info: "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

const STATUS_ICON: Record<MoveReadinessSignal["status"], React.ReactNode> = {
  good: <CheckCircle2 className="w-3.5 h-3.5" />,
  warn: <AlertTriangle className="w-3.5 h-3.5" />,
  bad: <XCircle className="w-3.5 h-3.5" />,
  info: <Info className="w-3.5 h-3.5" />,
};

const SEVERITY_TONE: Record<MoveReadinessBlocker["severity"], string> = {
  high: "border-red-500/40 bg-red-500/5",
  medium: "border-amber-500/40 bg-amber-500/5",
  low: "border-blue-500/40 bg-blue-500/5",
};

function readinessTone(score: number): { text: string; bar: string; label: string } {
  if (score >= 80) return { text: "text-emerald-500", bar: "bg-emerald-500", label: "Ready" };
  if (score >= 60) return { text: "text-blue-500", bar: "bg-blue-500", label: "Mostly ready" };
  if (score >= 40) return { text: "text-amber-500", bar: "bg-amber-500", label: "Work to do" };
  return { text: "text-red-500", bar: "bg-red-500", label: "Significant gap" };
}

function paceTone(status: MoveReadiness["paceStatus"]): { text: string; label: string } {
  if (status === "ahead") return { text: "text-emerald-500", label: "Ahead of pace" };
  if (status === "on_track") return { text: "text-blue-500", label: "On track" };
  if (status === "behind") return { text: "text-amber-500", label: "Behind pace" };
  if (status === "critical") return { text: "text-red-500", label: "Critically behind" };
  return { text: "text-muted-foreground", label: "Unknown" };
}

function EarmarksDialog({ earmarks }: { earmarks: { label: string; cents: number }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() =>
    earmarks.map((e) => ({ label: e.label, dollars: (e.cents / 100).toString() })),
  );
  const [submitting, setSubmitting] = useState(false);

  const addRow = () => setDraft((rows) => [...rows, { label: "", dollars: "" }]);
  const removeRow = (i: number) =>
    setDraft((rows) => rows.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: "label" | "dollars", value: string) =>
    setDraft((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));

  async function handleSave() {
    const payload = draft
      .map((r) => ({ label: r.label.trim(), dollars: parseFloat(r.dollars) || 0 }))
      .filter((r) => r.label.length > 0 && r.dollars > 0);
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/move/earmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ earmarks: payload }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Failed to save");
        return;
      }
      toast.success("Earmarks updated");
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => {
          setDraft(earmarks.map((e) => ({ label: e.label, dollars: (e.cents / 100).toString() })));
          setOpen(true);
        }}
        className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        <Lock className="w-3 h-3" />
        earmarks
      </button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Savings earmarks</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Portions of your savings balance reserved for non-move purposes (e.g. tax set-asides
          from owner&apos;s draw). These are subtracted from move-relevant savings.
        </p>
        <div className="space-y-2">
          {draft.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No earmarks yet.</p>
          )}
          {draft.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                placeholder="Label (e.g. Q2 taxes)"
                value={row.label}
                onChange={(e) => updateRow(i, "label", e.target.value)}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground">$</span>
              <Input
                type="number"
                inputMode="decimal"
                step="1"
                placeholder="0"
                value={row.dollars}
                onChange={(e) => updateRow(i, "dollars", e.target.value)}
                className="w-24"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeRow(i)}
                className="h-8 w-8 p-0"
              >
                <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="w-3 h-3 mr-1" />
            Add earmark
          </Button>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MoveReadinessReport({ data }: Props) {
  const tone = readinessTone(data.readinessScore);
  const pace = paceTone(data.paceStatus);
  const savedPct =
    data.targetSavingsCents > 0
      ? Math.min(100, Math.round((data.currentSavedCents / data.targetSavingsCents) * 100))
      : 0;
  const projectedPct =
    data.targetSavingsCents > 0 && data.projectedSavedAtMoveCents !== null
      ? Math.min(100, Math.round((data.projectedSavedAtMoveCents / data.targetSavingsCents) * 100))
      : null;

  return (
    <div className="space-y-6">
      {/* Hero: readiness score + countdown */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-xs text-muted-foreground uppercase">Readiness</p>
              <div className="flex items-baseline gap-2 mt-1">
                <p className={`text-5xl font-bold tracking-tight ${tone.text}`}>{data.readinessScore}</p>
                <span className="text-sm text-muted-foreground">/100</span>
              </div>
              <p className={`text-sm font-medium mt-1 ${tone.text}`}>{tone.label}</p>
              <div className="h-2 rounded-full bg-muted overflow-hidden mt-3">
                <div className={`h-full ${tone.bar} transition-all`} style={{ width: `${data.readinessScore}%` }} />
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Move date</p>
              <p className="text-2xl font-bold tracking-tight mt-1">
                {data.moveDate ?? "Not set"}
              </p>
              {data.daysUntilMove !== null && (
                <p className="text-sm text-muted-foreground mt-1">
                  {data.daysUntilMove > 0
                    ? `${data.daysUntilMove} days · ${data.monthsUntilMove} months out`
                    : data.daysUntilMove === 0
                      ? "Today"
                      : `${Math.abs(data.daysUntilMove)} days past`}
                </p>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground uppercase">Savings (move-relevant)</p>
                <EarmarksDialog earmarks={data.earmarks} />
              </div>
              <p className="text-2xl font-bold tracking-tight mt-1">
                {formatCurrency(data.currentSavedCents)}
                <span className="text-sm text-muted-foreground font-normal">
                  {" "}/ {formatCurrency(data.targetSavingsCents)}
                </span>
              </p>
              <div className="h-2 rounded-full bg-muted overflow-hidden mt-2 relative">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${savedPct}%` }} />
                {projectedPct !== null && projectedPct > savedPct && (
                  <div
                    className="absolute top-0 h-full bg-emerald-500/30"
                    style={{ left: `${savedPct}%`, width: `${projectedPct - savedPct}%` }}
                  />
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {savedPct}% saved · live balance {formatCurrency(data.realSavingsBalanceCents)}
                {data.earmarkedCents > 0 && (
                  <> · {formatCurrency(data.earmarkedCents)} earmarked</>
                )}
                {projectedPct !== null && projectedPct !== savedPct && (
                  <> · projected {projectedPct}% at move date</>
                )}
              </p>
              {data.earmarks.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {data.earmarks.map((e, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded"
                    >
                      <Lock className="w-2.5 h-2.5" />
                      {e.label}: {formatCurrency(e.cents)}
                    </span>
                  ))}
                </div>
              )}
              {data.planFieldOutOfDate && (
                <p className="text-[10px] text-amber-500 mt-1">
                  Plan record says {formatCurrency(data.planRecordedSavedCents)} — using live balance instead.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Diagnostic strip */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Readiness Signals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.signals.map((s, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <Badge variant="outline" className={`${STATUS_TONE[s.status]} text-[10px] flex items-center gap-1 shrink-0`}>
                  {STATUS_ICON[s.status]}
                </Badge>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{s.label}</p>
                  <p className="text-xs text-muted-foreground leading-snug">{s.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Savings + DTI deep-dive */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              Savings Pace
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <p className={`text-2xl font-bold ${pace.text}`}>{pace.label}</p>
              {data.paceStatus === "ahead" || data.paceStatus === "on_track" ? (
                <TrendingUp className="w-5 h-5 text-emerald-500" />
              ) : data.paceStatus !== "unknown" ? (
                <TrendingDown className="w-5 h-5 text-red-500" />
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Current pace</p>
                <p className="text-sm font-semibold">{formatCurrency(data.currentMonthlyPaceCents)}/mo</p>
                <p className="text-[10px] text-muted-foreground">trailing 30d deposits ≥ $20</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Required pace</p>
                <p className="text-sm font-semibold">{formatCurrency(data.requiredMonthlyPaceCents)}/mo</p>
                <p className="text-[10px] text-muted-foreground">
                  {data.monthsUntilMove !== null ? `over ${data.monthsUntilMove} months` : "no end date"}
                </p>
              </div>
            </div>
            {data.projectedSavedAtMoveCents !== null && data.targetSavingsCents > 0 && (
              <div className="pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground">Projection at current pace</p>
                <p className="text-sm font-semibold mt-0.5">
                  {formatCurrency(data.projectedSavedAtMoveCents)} saved by {data.moveDate}
                </p>
                {data.projectedSavedAtMoveCents < data.targetSavingsCents && (
                  <p className="text-xs text-amber-500 mt-1">
                    {formatCurrency(data.targetSavingsCents - data.projectedSavedAtMoveCents)} short of target
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Debt-to-Income</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Most landlords want under 40%. Yours captures monthly debt minimums vs trailing-30 income.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <p
                className={`text-3xl font-bold tracking-tight ${
                  data.dtiStatus === "good"
                    ? "text-emerald-500"
                    : data.dtiStatus === "warn"
                      ? "text-amber-500"
                      : "text-red-500"
                }`}
              >
                {(data.dtiRatio * 100).toFixed(0)}%
              </p>
              <Badge variant="outline" className={STATUS_TONE[data.dtiStatus]}>
                {data.dtiStatus === "good" ? "qualifying" : data.dtiStatus === "warn" ? "borderline" : "blocking"}
              </Badge>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden relative">
              <div
                className={`h-full ${
                  data.dtiStatus === "good"
                    ? "bg-emerald-500"
                    : data.dtiStatus === "warn"
                      ? "bg-amber-500"
                      : "bg-red-500"
                }`}
                style={{ width: `${Math.min(100, data.dtiRatio * 100)}%` }}
              />
              {/* 40% marker */}
              <div className="absolute top-0 bottom-0 w-px border-l border-dashed border-foreground/40" style={{ left: "40%" }} />
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Monthly mins</p>
                <p className="text-sm font-semibold">{formatCurrency(data.monthlyDebtMinsCents)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Trailing-30 income</p>
                <p className="text-sm font-semibold">{formatCurrency(data.trailing30IncomeCents)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Blockers */}
      {data.blockers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Blockers
              <span className="text-xs font-normal text-muted-foreground">
                · {data.blockers.length} item{data.blockers.length !== 1 ? "s" : ""}
              </span>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Concrete things to fix before move-out, ranked by severity.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.blockers.map((b, i) => (
              <div key={i} className={`rounded-md border p-3 ${SEVERITY_TONE[b.severity]}`}>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      b.severity === "high"
                        ? "bg-red-500/15 text-red-400 border-red-500/30 text-[10px]"
                        : b.severity === "medium"
                          ? "bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]"
                          : "bg-blue-500/15 text-blue-400 border-blue-500/30 text-[10px]"
                    }
                  >
                    {b.severity.toUpperCase()}
                  </Badge>
                  <span className="text-[10px] uppercase text-muted-foreground">{b.category}</span>
                  <span className="text-sm font-medium">{b.title}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 ml-1 leading-relaxed">{b.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Rental risk items */}
      {data.rentalRiskItems.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Likely visible to landlords</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Rental background checks pull collections regardless of credit score, plus recent derogatories.
              Settling smaller items with delete language is the cheapest cleanup.
            </p>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {data.rentalRiskItems.map((item, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-border last:border-0">
                <div className="min-w-0">
                  <p className="font-medium truncate">{item.creditor}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {item.category.replace("_", " ")} · {item.note}
                  </p>
                </div>
                <p className="font-semibold shrink-0">{formatCurrency(item.balanceCents)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

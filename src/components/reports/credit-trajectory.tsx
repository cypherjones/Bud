"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Target, Zap } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { formatCurrency } from "@/lib/utils/format";
import type { CreditTrajectory } from "@/lib/actions/credit-trajectory";

type Props = {
  data: CreditTrajectory;
};

function paceTone(status: CreditTrajectory["paceStatus"]): { text: string; bg: string; label: string } {
  if (status === "ahead")
    return { text: "text-emerald-500", bg: "bg-emerald-500/15 border-emerald-500/30", label: "Ahead of pace" };
  if (status === "on_track")
    return { text: "text-blue-500", bg: "bg-blue-500/15 border-blue-500/30", label: "On track" };
  if (status === "behind")
    return { text: "text-amber-500", bg: "bg-amber-500/15 border-amber-500/30", label: "Behind pace" };
  if (status === "critical")
    return { text: "text-red-500", bg: "bg-red-500/15 border-red-500/30", label: "Critical" };
  return { text: "text-muted-foreground", bg: "bg-muted border-border", label: "Need more history" };
}

function formatShortDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function CreditTrajectoryReport({ data }: Props) {
  if (!data.hasHistory || data.currentScore === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Credit Trajectory</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-6 text-center">
            Log a credit score in chat (or via the credit page) to see velocity, pacing toward 600/670, and
            top-impact items.
          </p>
          {data.topImpactItems.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-xs font-medium text-muted-foreground">Top items to clear from your report:</p>
              {data.topImpactItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                  <div>
                    <p className="font-medium">{item.creditor}</p>
                    <p className="text-[10px] text-muted-foreground">{item.recommendation}</p>
                  </div>
                  <p className="font-semibold">{formatCurrency(item.balanceCents)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const pace = paceTone(data.paceStatus);
  const VelocityIcon =
    data.velocityPerMonth > 0.5 ? TrendingUp : data.velocityPerMonth < -0.5 ? TrendingDown : Minus;
  const velocityColor =
    data.velocityPerMonth > 0.5
      ? "text-emerald-500"
      : data.velocityPerMonth < -0.5
        ? "text-red-500"
        : "text-muted-foreground";

  const chartData = data.history.map((s) => ({
    date: formatShortDate(s.date),
    score: s.score,
  }));

  return (
    <div className="space-y-6">
      {/* Hero strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-[10px] text-muted-foreground uppercase">Current</p>
            <p className="text-3xl font-bold tracking-tight">{data.currentScore}</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {data.latestScore?.bureau ? `${data.latestScore.bureau} · ` : ""}
              {data.latestScore?.date ? formatShortDate(data.latestScore.date) : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-[10px] text-muted-foreground uppercase">Velocity</p>
            <div className="flex items-center gap-2">
              <VelocityIcon className={`w-5 h-5 ${velocityColor}`} />
              <p className={`text-3xl font-bold tracking-tight ${velocityColor}`}>
                {data.velocityPerMonth > 0 ? "+" : ""}
                {data.velocityPerMonth.toFixed(1)}
              </p>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">pts/mo over {data.monthsObserved}mo</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-[10px] text-muted-foreground uppercase">To 600</p>
            <p className="text-3xl font-bold tracking-tight">{data.pointsTo600}</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {data.requiredVelocityTo600 !== null
                ? `${data.requiredVelocityTo600.toFixed(1)} pts/mo to make it`
                : "no move date set"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-[10px] text-muted-foreground uppercase">To 670</p>
            <p className="text-3xl font-bold tracking-tight">{data.pointsTo670}</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {data.requiredVelocityTo670 !== null
                ? `${data.requiredVelocityTo670.toFixed(1)} pts/mo to make it`
                : "no move date set"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pace banner */}
      <Card className={pace.bg}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            <Target className={`w-5 h-5 ${pace.text}`} />
            <div className="flex-1">
              <p className={`text-sm font-semibold ${pace.text}`}>
                Pacing: {pace.label}
                {data.moveDate && <span className="text-muted-foreground font-normal"> · target {data.moveDate}</span>}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {data.currentScore >= 600
                  ? "Already past 600 — focus on holding ground while clearing remaining derogatories."
                  : data.requiredVelocityTo600 !== null && data.velocityPerMonth >= data.requiredVelocityTo600
                    ? `Current velocity (${data.velocityPerMonth.toFixed(1)} pts/mo) clears 600 by move date if it holds.`
                    : data.requiredVelocityTo600 !== null
                      ? `Need to lift velocity by ${(data.requiredVelocityTo600 - data.velocityPerMonth).toFixed(1)} pts/mo to hit 600 by move date.`
                      : "Add a move date in the move planner to see required velocity."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Score chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Score History</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length >= 2 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis domain={[300, 850]} ticks={[300, 580, 600, 670, 740, 800, 850]} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <ReferenceLine y={600} stroke="#3b82f6" strokeDasharray="2 2" label={{ value: "600 (rental)", position: "right", fontSize: 10, fill: "#3b82f6" }} />
                <ReferenceLine y={670} stroke="#10b981" strokeDasharray="2 2" label={{ value: "670 (Good)", position: "right", fontSize: 10, fill: "#10b981" }} />
                <Line type="monotone" dataKey="score" stroke="#7c3aed" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Only one score on file. Log another via chat to start a velocity line.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Factor mini-strip */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Underlying signals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Signal
              label="Utilization"
              value={data.utilizationPct !== null ? `${data.utilizationPct}%` : "—"}
              detail={
                data.utilizationTrend === "improving"
                  ? "improving — keep going"
                  : data.utilizationTrend === "worsening"
                    ? "worsening — biggest score drag"
                    : data.utilizationTrend === "stable"
                      ? "stable"
                      : "no trend yet"
              }
              status={
                data.utilizationPct === null
                  ? "info"
                  : data.utilizationPct > 30
                    ? "bad"
                    : data.utilizationPct > 10
                      ? "warn"
                      : "good"
              }
            />
            <Signal
              label="Derogatory marks"
              value={data.derogatoryCount !== null ? `${data.derogatoryCount}` : "—"}
              detail={
                data.derogatoryCount && data.derogatoryCount > 5
                  ? "many — disputes + settlements give biggest unlocks"
                  : data.derogatoryCount && data.derogatoryCount > 0
                    ? "active — clear in priority order"
                    : "clean"
              }
              status={
                data.derogatoryCount === null || data.derogatoryCount === 0
                  ? "good"
                  : data.derogatoryCount > 5
                    ? "bad"
                    : "warn"
              }
            />
            <Signal
              label="History observed"
              value={`${data.monthsObserved}mo`}
              detail={
                data.monthsObserved >= 6
                  ? "trend reliable"
                  : data.monthsObserved >= 3
                    ? "early signal"
                    : "log more scores for reliable velocity"
              }
              status={data.monthsObserved >= 6 ? "good" : data.monthsObserved >= 3 ? "warn" : "info"}
            />
          </div>
        </CardContent>
      </Card>

      {/* Top impact items */}
      {data.topImpactItems.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Top-impact items to clear
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Ranked by leverage: duplicates first (free under FCRA), then largest unresolved balances.
            </p>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {data.topImpactItems.map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 text-sm py-2 border-b border-border last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{item.creditor}</span>
                    <Badge variant="outline" className="text-[9px]">
                      {item.category.replace("_", " ")}
                    </Badge>
                    {item.status === "dispute" && (
                      <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30 text-[9px]">
                        DISPUTE
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{item.recommendation}</p>
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

function Signal({
  label,
  value,
  detail,
  status,
}: {
  label: string;
  value: string;
  detail: string;
  status: "good" | "warn" | "bad" | "info";
}) {
  const tone =
    status === "good"
      ? "text-emerald-500"
      : status === "warn"
        ? "text-amber-500"
        : status === "bad"
          ? "text-red-500"
          : "text-muted-foreground";
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
      <p className={`text-2xl font-bold tracking-tight mt-0.5 ${tone}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{detail}</p>
    </div>
  );
}

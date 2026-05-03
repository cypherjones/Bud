"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
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

type Score = {
  id: string;
  score: number;
  bureau: string | null;
  source: string | null;
  date: string;
  notes: string | null;
};

type Factors = {
  utilizationRatio: number | null;
  onTimePayments: number | null;
  totalAccounts: number | null;
  hardInquiries: number | null;
  oldestAccountMonths: number | null;
  derogatoryMarks: number | null;
  totalBalance: number | null;
  totalCreditLimit: number | null;
} | null;

type Props = {
  data: {
    latest: Score;
    previous: Score | null;
    change: number;
    tier: string;
    factors: Factors;
    history: Score[];
  };
};

function tierColor(tier: string): string {
  if (tier === "Excellent" || tier === "Very Good") return "text-emerald-600";
  if (tier === "Good") return "text-blue-600";
  if (tier === "Fair") return "text-amber-500";
  return "text-red-500";
}

function shortDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function CreditDetailView({ data }: Props) {
  const ChangeIcon = data.change > 0 ? TrendingUp : data.change < 0 ? TrendingDown : Minus;
  const changeColor =
    data.change > 0 ? "text-emerald-600" : data.change < 0 ? "text-red-500" : "text-muted-foreground";

  const chartData = data.history.map((s) => ({
    date: new Date(s.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    score: s.score,
  }));

  const utilizationPct =
    data.factors?.utilizationRatio !== null && data.factors?.utilizationRatio !== undefined
      ? Math.round(data.factors.utilizationRatio * 100)
      : null;

  return (
    <div className="space-y-6">
      {/* Headline: latest score, tier, delta */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Current Score</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold tracking-tight">{data.latest.score}</p>
            <p className={`text-sm font-medium mt-1 ${tierColor(data.tier)}`}>{data.tier}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {data.latest.bureau ? `${data.latest.bureau} · ` : ""}
              {data.latest.source ? `${data.latest.source} · ` : ""}
              {shortDate(data.latest.date)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Change</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <ChangeIcon className={`w-6 h-6 ${changeColor}`} />
              <p className={`text-3xl font-bold tracking-tight ${changeColor}`}>
                {data.change > 0 ? "+" : ""}
                {data.change}
              </p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.previous ? `from ${data.previous.score} on ${shortDate(data.previous.date)}` : "no prior score on file"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Utilization</CardTitle>
          </CardHeader>
          <CardContent>
            {utilizationPct !== null ? (
              <>
                <p
                  className={`text-3xl font-bold tracking-tight ${
                    utilizationPct > 30 ? "text-red-500" : utilizationPct > 10 ? "text-amber-500" : "text-emerald-600"
                  }`}
                >
                  {utilizationPct}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {utilizationPct > 30 ? "Above 30% — biggest score-recovery lever" : utilizationPct > 10 ? "Below 30% — work toward 10%" : "Below 10% — keep here"}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No utilization data on file</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Score history chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Score History</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length >= 2 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis domain={[300, 850]} ticks={[300, 580, 670, 740, 800, 850]} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <ReferenceLine y={670} stroke="#94a3b8" strokeDasharray="2 2" label={{ value: "Good", position: "right", fontSize: 10, fill: "#94a3b8" }} />
                <ReferenceLine y={740} stroke="#94a3b8" strokeDasharray="2 2" label={{ value: "Very Good", position: "right", fontSize: 10, fill: "#94a3b8" }} />
                <Line type="monotone" dataKey="score" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Only one score on file. Log another via chat to start a trend line.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Factors table */}
      {data.factors && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Latest Factors</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <Factor label="Utilization" value={utilizationPct !== null ? `${utilizationPct}%` : "—"} />
              <Factor label="On-time payments" value={data.factors.onTimePayments !== null ? `${data.factors.onTimePayments} months` : "—"} />
              <Factor label="Total accounts" value={data.factors.totalAccounts ?? "—"} />
              <Factor label="Hard inquiries (24mo)" value={data.factors.hardInquiries ?? "—"} />
              <Factor label="Oldest account" value={data.factors.oldestAccountMonths !== null ? `${Math.floor(data.factors.oldestAccountMonths / 12)}y ${data.factors.oldestAccountMonths % 12}m` : "—"} />
              <Factor label="Derogatory marks" value={data.factors.derogatoryMarks ?? "—"} />
              <Factor
                label="Total balance"
                value={data.factors.totalBalance !== null ? `$${(data.factors.totalBalance / 100).toLocaleString()}` : "—"}
              />
              <Factor
                label="Total credit limit"
                value={data.factors.totalCreditLimit !== null ? `$${(data.factors.totalCreditLimit / 100).toLocaleString()}` : "—"}
              />
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Factor({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

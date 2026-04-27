"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  YAxis,
} from "recharts";

type ScoreEntry = { score: number; date: string };

type Props = {
  data: {
    latest: { score: number; date: string };
    change: number;
    tier: string;
    factors: { utilizationRatio: number | null } | null | undefined;
    history: ScoreEntry[];
  } | null;
};

export function CreditScoreCard({ data }: Props) {
  if (!data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Credit Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">
            No score logged yet. Tell Bud your current credit score.
          </p>
        </CardContent>
      </Card>
    );
  }

  const ChangeIcon =
    data.change > 0 ? TrendingUp : data.change < 0 ? TrendingDown : Minus;
  const changeColor =
    data.change > 0 ? "text-green-600" : data.change < 0 ? "text-red-500" : "text-muted-foreground";

  const tierColor =
    data.tier === "Excellent" || data.tier === "Very Good"
      ? "text-green-600"
      : data.tier === "Good"
      ? "text-primary"
      : data.tier === "Fair"
      ? "text-amber-500"
      : "text-red-500";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Credit Score
        </CardTitle>
        <span className={`text-sm font-medium ${tierColor}`}>{data.tier}</span>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold">{data.latest.score}</span>
          <span className={`flex items-center gap-0.5 text-sm font-medium ${changeColor}`}>
            <ChangeIcon className="w-3.5 h-3.5" />
            {data.change > 0 ? "+" : ""}
            {data.change}
          </span>
        </div>

        {/* Sparkline */}
        {data.history.length > 1 && (
          <div className="h-12">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.history}>
                <YAxis domain={["dataMin - 20", "dataMax + 20"]} hide />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {data.factors?.utilizationRatio !== null && data.factors?.utilizationRatio !== undefined && (
          <p className="text-xs text-muted-foreground">
            Utilization: {Math.round(data.factors.utilizationRatio * 100)}%
            {data.factors.utilizationRatio > 0.3 && " — get below 30% for a score boost"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

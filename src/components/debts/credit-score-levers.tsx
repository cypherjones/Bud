import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/format";
import { TrendingUp, AlertOctagon } from "lucide-react";

type Lever = {
  debtId: string;
  creditorName: string;
  balance: number;
  creditLimit: number;
  currentUtilizationPct: number;
  toReachThirty: number;
  toReachTen: number;
  isOverLimit: boolean;
};

type Props = {
  data: {
    cards: Lever[];
    totalToReachThirty: number;
    totalToReachTen: number;
    overLimitCount: number;
  };
};

function utilTone(pct: number): { text: string; bar: string; badge: string } {
  if (pct >= 100) return { text: "text-red-600", bar: "bg-red-600", badge: "bg-red-500/15 text-red-400 border-red-500/30" };
  if (pct >= 50) return { text: "text-red-500", bar: "bg-red-500", badge: "bg-red-500/15 text-red-400 border-red-500/30" };
  if (pct >= 30) return { text: "text-amber-500", bar: "bg-amber-500", badge: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
  if (pct >= 10) return { text: "text-amber-400", bar: "bg-amber-400", badge: "bg-amber-500/10 text-amber-400 border-amber-500/20" };
  return { text: "text-emerald-500", bar: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
}

export function CreditScoreLevers({ data }: Props) {
  if (data.cards.length === 0) return null;

  const anyAboveThirty = data.cards.some((c) => c.toReachThirty > 0);
  const anyOverLimit = data.overLimitCount > 0;

  return (
    <Card className={
      anyOverLimit
        ? "border-red-300 bg-red-50/40 dark:border-red-900 dark:bg-red-950/20"
        : anyAboveThirty
          ? "border-amber-300 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20"
          : ""
    }>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Credit Score Levers
        </CardTitle>
        {anyAboveThirty && (
          <p className="text-xs text-muted-foreground mt-1">
            Utilization is the #1 actionable factor for credit score. Below are the exact dollar
            targets to cross the 30% and 10% thresholds.
            {data.totalToReachThirty > 0 && (
              <> Aggregate: <span className="font-medium text-foreground">{formatCurrency(data.totalToReachThirty)}</span> to get every card under 30%.</>
            )}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {data.cards.map((c) => {
          const tone = utilTone(c.currentUtilizationPct);
          const fillPct = Math.min(100, c.currentUtilizationPct);
          return (
            <div key={c.debtId} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">{c.creditorName}</span>
                  {c.isOverLimit && (
                    <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30 text-[10px]">
                      <AlertOctagon className="w-3 h-3 mr-1" />
                      OVER LIMIT
                    </Badge>
                  )}
                </div>
                <span className={`text-sm font-semibold ${tone.text}`}>
                  {Math.round(c.currentUtilizationPct)}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={`h-full ${tone.bar}`} style={{ width: `${fillPct}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {formatCurrency(c.balance)} of {formatCurrency(c.creditLimit)} limit
                </span>
                <span className="flex items-center gap-3">
                  {c.toReachThirty > 0 && (
                    <span>
                      <span className="text-amber-500 font-medium">{formatCurrency(c.toReachThirty)}</span> to 30%
                    </span>
                  )}
                  {c.toReachTen > 0 && c.toReachTen !== c.toReachThirty && (
                    <span>
                      <span className="text-emerald-500 font-medium">{formatCurrency(c.toReachTen)}</span> to 10%
                    </span>
                  )}
                  {c.toReachThirty === 0 && (
                    <span className="text-emerald-500">already under 30%</span>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

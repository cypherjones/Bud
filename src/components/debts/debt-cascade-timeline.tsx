import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import { CheckCircle2, Flag } from "lucide-react";

type Step = {
  debtId: string;
  creditorName: string;
  balance: number;
  apr: number;
  minimumPayment: number;
  payoffMonth: number;
  payoffDate: string; // YYYY-MM
};

type Props = {
  data: {
    avalanche: Step[];
    avalancheMonths: number | null;
    totalMinimums: number;
  };
};

function formatYM(ym: string): string {
  if (!ym || ym === "—") return "—";
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function yearsAndMonths(months: number): string {
  if (months < 12) return `${months} mo`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m === 0 ? `${y} yr` : `${y} yr ${m} mo`;
}

export function DebtCascadeTimeline({ data }: Props) {
  const cleared = data.avalanche.filter((s) => s.payoffMonth > 0);
  if (cleared.length === 0) return null;

  // Build cumulative-freed-payment annotations: when each debt clears, its
  // minimum gets added to the pool that attacks the remaining debts.
  let cumulativeFreed = 0;
  const steps = cleared.map((s) => {
    cumulativeFreed += s.minimumPayment;
    return {
      ...s,
      cumulativeFreed,
      remainingAfter: data.totalMinimums - cumulativeFreed,
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Snowball Cascade</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          When each debt clears, its minimum payment rolls into the next-priority debt — speeding it
          up. Below: the cascade at your current pace, in avalanche order.
        </p>
      </CardHeader>
      <CardContent>
        <ol className="relative border-l-2 border-muted pl-6 space-y-5 ml-2">
          {steps.map((s, i) => {
            const isLast = i === steps.length - 1;
            return (
              <li key={s.debtId} className="relative">
                <div
                  className={`absolute -left-[34px] top-0 w-6 h-6 rounded-full flex items-center justify-center ring-4 ring-background ${
                    isLast ? "bg-emerald-500" : "bg-primary"
                  }`}
                >
                  {isLast ? (
                    <Flag className="w-3 h-3 text-white" />
                  ) : (
                    <CheckCircle2 className="w-3 h-3 text-white" />
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-sm">{s.creditorName}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatYM(s.payoffDate)} · month {s.payoffMonth}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                    <span>{formatCurrency(s.balance)} cleared</span>
                    <span>{(s.apr * 100).toFixed(2)}% APR</span>
                    <span className="text-emerald-500">
                      → frees {formatCurrency(s.minimumPayment)}/mo
                    </span>
                  </div>
                  {!isLast && (
                    <p className="text-[11px] text-muted-foreground italic">
                      Cumulative freed: {formatCurrency(s.cumulativeFreed)}/mo cascading into the
                      next debt.
                    </p>
                  )}
                  {isLast && (
                    <p className="text-[11px] font-medium text-emerald-500">
                      All debts cleared — {formatCurrency(data.totalMinimums)}/mo back in your pocket.
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {data.avalancheMonths !== null && (
          <p className="text-xs text-muted-foreground mt-5 pt-3 border-t border-border">
            Total to debt-free: <span className="font-medium text-foreground">{yearsAndMonths(data.avalancheMonths)}</span> at
            current pace, avalanche strategy.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import { PiggyBank } from "lucide-react";

type Props = {
  data: {
    forecastedIncome: number;
    recurringBills: number;
    discretionaryBuffer: number;
    target: number;
    daysWindow: number;
    pastSpending: number;
    pastRecurringSpending: number;
  };
};

export function SavingsTargetCard({ data }: Props) {
  const positive = data.target > 0;
  const color = positive ? "text-emerald-500" : "text-amber-500";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Savings Target ({data.daysWindow} days)
        </CardTitle>
        <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center">
          <PiggyBank className="w-5 h-5 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl font-bold tracking-tight ${color}`}>
            {positive ? formatCurrency(data.target) : formatCurrency(0)}
          </span>
          {!positive && (
            <span className="text-xs text-amber-500">no surplus this window</span>
          )}
        </div>

        {/* Breakdown — what feeds into the number */}
        <div className="mt-4 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Forecasted income</span>
            <span className="font-medium text-emerald-600">+{formatCurrency(data.forecastedIncome)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Recurring bills</span>
            <span className="font-medium text-red-500">−{formatCurrency(data.recurringBills)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Discretionary buffer</span>
            <span className="font-medium text-red-500">−{formatCurrency(data.discretionaryBuffer)}</span>
          </div>
          <div className="border-t border-border pt-1.5 flex justify-between">
            <span className="text-muted-foreground">Net</span>
            <span className={`font-semibold ${color}`}>{formatCurrency(data.target)}</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          Buffer estimated from {formatCurrency(data.pastSpending)} of past-30-day spending minus one cycle of recurring bills.
        </p>
      </CardContent>
    </Card>
  );
}

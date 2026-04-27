"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/utils/format";

type DebtInfo = {
  creditorName: string;
  currentBalance: number;
  originalBalance: number;
  interestRate: number;
  type: string;
};

type Props = {
  debts: DebtInfo[];
  totalActive: number;
  totalOriginal: number;
  progress: number;
};

export function DebtProgress({ debts, totalActive, totalOriginal, progress }: Props) {
  if (debts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Debt Payoff Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            No debts tracked yet. Tell Bud about your debts to get a smart payoff plan.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">Debt Payoff Progress</CardTitle>
        <span className="text-sm font-medium text-primary">{progress}% paid</span>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall progress */}
        <div>
          <div className="flex justify-between text-sm mb-1.5">
            <span className="text-muted-foreground">
              {formatCurrency(totalOriginal - totalActive)} paid off
            </span>
            <span className="font-medium">{formatCurrency(totalActive)} remaining</span>
          </div>
          <Progress value={progress} className="h-3" />
        </div>

        {/* Individual debts */}
        <div className="space-y-3 pt-2">
          {debts.slice(0, 4).map((d) => {
            const pct = d.originalBalance > 0
              ? Math.round(((d.originalBalance - d.currentBalance) / d.originalBalance) * 100)
              : 0;
            return (
              <div key={d.creditorName} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{d.creditorName}</span>
                  <span className="text-muted-foreground">
                    {formatCurrency(d.currentBalance)} at {(d.interestRate * 100).toFixed(1)}%
                  </span>
                </div>
                <Progress value={pct} className="h-1.5" />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

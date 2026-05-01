"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/format";

type TaxObligation = {
  agency: string;
  type: string;
  taxYear: number;
  remainingBalance: number;
  dueDate: string | null;
  isInstallmentPlan: boolean;
};

type Props = {
  obligations: TaxObligation[];
  totalOwed: number;
  nextDue: TaxObligation | null;
};

export function TaxStatusCard({ obligations, totalOwed, nextDue }: Props) {
  if (obligations.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Tax Obligations</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">
            No tax obligations tracked. Tell Bud about any taxes owed.
          </p>
        </CardContent>
      </Card>
    );
  }

  const daysUntilDue = nextDue?.dueDate
    ? Math.ceil((new Date(nextDue.dueDate).getTime() - Date.now()) / 86400000)
    : null;

  const urgency =
    daysUntilDue !== null && daysUntilDue <= 0
      ? "destructive"
      : daysUntilDue !== null && daysUntilDue <= 14
      ? "secondary"
      : "outline";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">Tax Obligations</CardTitle>
        <span className="text-sm font-medium">{formatCurrency(totalOwed)}</span>
      </CardHeader>
      <CardContent className="space-y-3">
        {obligations.map((t) => (
          <div key={`${t.agency}-${t.taxYear}`} className="flex items-center justify-between text-sm">
            <div>
              <span className="font-medium">{t.agency}</span>
              <span className="text-muted-foreground ml-1">({t.taxYear})</span>
            </div>
            <span className="font-medium">{formatCurrency(t.remainingBalance)}</span>
          </div>
        ))}

        {nextDue?.dueDate && (
          <div className="pt-1">
            <Badge variant={urgency as "destructive" | "secondary" | "outline"}>
              {daysUntilDue !== null && daysUntilDue <= 0
                ? "OVERDUE"
                : `Due in ${daysUntilDue} days (${nextDue.dueDate})`}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

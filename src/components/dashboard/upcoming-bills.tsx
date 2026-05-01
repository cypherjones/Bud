"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";

type RecurringBill = {
  merchant: string;
  amount: number;
  frequency: string;
  nextDueDate: string | null;
};

export function UpcomingBills({ bills }: { bills: RecurringBill[] }) {
  if (bills.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">Upcoming Bills</CardTitle>
          <span className="text-sm text-muted-foreground">Next 30 days</span>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No recurring bills detected yet. Sync your bank to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalMonthly = bills
    .filter((b) => b.frequency === "monthly")
    .reduce((s, b) => s + b.amount, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">Upcoming Bills</CardTitle>
        <span className="text-sm text-muted-foreground">
          ~{formatCurrency(totalMonthly)}/mo recurring
        </span>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {bills.map((bill) => (
            <div
              key={bill.merchant}
              className="flex items-center justify-between p-3 rounded-lg bg-accent/50"
            >
              <div>
                <p className="text-sm font-medium">{bill.merchant}</p>
                <p className="text-xs text-muted-foreground">
                  {bill.frequency}{bill.nextDueDate ? ` · due ${bill.nextDueDate}` : ""}
                </p>
              </div>
              <span className="text-sm font-medium">{formatCurrency(bill.amount)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils/format";

type Props = {
  data: {
    groups: { category: string; items: { merchant: string | null; amount: number; date: string }[]; total: number }[];
    total: number;
    count: number;
  };
};

export function TaxDeductionReport({ data }: Props) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Potential Deductions</p>
            <p className="text-2xl font-bold tracking-tight mt-1 text-emerald-600">{formatCurrency(data.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Deductible Transactions</p>
            <p className="text-2xl font-bold tracking-tight mt-1">{data.count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Categories</p>
            <p className="text-2xl font-bold tracking-tight mt-1">{data.groups.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Grouped Tables */}
      {data.groups.map((group) => (
        <Card key={group.category}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">{group.category}</CardTitle>
              <span className="text-sm font-semibold">{formatCurrency(group.total)}</span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Date</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead className="pr-4 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.items.map((item, i) => (
                  <TableRow key={i}>
                    <TableCell className="pl-4 text-muted-foreground">
                      {new Date(item.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </TableCell>
                    <TableCell className="font-medium">{item.merchant ?? "Unknown"}</TableCell>
                    <TableCell className="pr-4 text-right">{formatCurrency(item.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {data.count === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">No tax-deductible transactions found. Tag transactions with #tax-deductible to track them.</p>
          </CardContent>
        </Card>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-muted-foreground">
        This report is for reference only and does not constitute tax advice. Consult a tax professional for filing.
      </p>
    </div>
  );
}

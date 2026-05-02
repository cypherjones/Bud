import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import { AlertTriangle } from "lucide-react";

type Props = {
  cluster: {
    startDate: string;
    endDate: string;
    totalOutflow: number;
    totalInflow: number;
    billCount: number;
    biggestBillName: string;
    biggestBillAmount: number;
  } | null;
};

function shortDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function BillClusterBanner({ cluster }: Props) {
  if (!cluster) return null;

  const net = cluster.totalOutflow - cluster.totalInflow;
  return (
    <Card className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
      <CardContent className="py-3 px-4 flex items-center gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <div className="text-sm flex-1">
          <span className="font-medium">Heads up: </span>
          <span>
            {formatCurrency(cluster.totalOutflow)} of bills hits between{" "}
            <span className="font-medium">{shortDate(cluster.startDate)}–{shortDate(cluster.endDate)}</span>
            {cluster.totalInflow > 0 ? (
              <>
                , versus {formatCurrency(cluster.totalInflow)} incoming
              </>
            ) : null}
            . Net <span className="font-medium text-red-600 dark:text-red-400">−{formatCurrency(net)}</span> over {cluster.billCount} {cluster.billCount === 1 ? "bill" : "bills"}
            {cluster.biggestBillName ? (
              <> · biggest: <span className="font-medium">{cluster.biggestBillName}</span> ({formatCurrency(cluster.biggestBillAmount)})</>
            ) : null}
            .
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

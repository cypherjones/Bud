import { Aside } from "@/components/plan/plan-ui";
import { formatCurrency } from "@/lib/utils/format";
import type { DebtDeadline } from "@/lib/actions/debts";
import type { BillCluster } from "@/lib/actions/dashboard";

const day = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Things that need a look before anything else on the page. Renders nothing when there's nothing. */
export function Notices({ deadlines, cluster }: { deadlines: DebtDeadline[]; cluster: BillCluster | null }) {
  if (deadlines.length === 0 && !cluster) return null;
  return (
    <div className="space-y-3">
      {deadlines.map((d) => {
        const when = d.daysAway < 0 ? `${Math.abs(d.daysAway)} ${Math.abs(d.daysAway) === 1 ? "day" : "days"} past due` : d.daysAway === 0 ? "today" : `in ${d.daysAway} ${d.daysAway === 1 ? "day" : "days"}`;
        return (
          <Aside key={d.debtId} tone="warn" title={`${d.creditorName}: ${formatCurrency(d.amount)} by ${day(d.deadline)}, ${when}`}>
            {d.note ?? "Set on the debt. Clear it on /debts once it's handled."}
          </Aside>
        );
      })}
      {cluster && (
        <Aside tone="warn" title={`${formatCurrency(cluster.totalOutflow)} of bills lands ${day(cluster.startDate)}–${day(cluster.endDate)}`}>
          {cluster.billCount} {cluster.billCount === 1 ? "bill" : "bills"}
          {cluster.totalInflow > 0 ? `, against ${formatCurrency(cluster.totalInflow)} coming in that week` : ", with no pay landing inside that week"}
          {cluster.biggestBillName ? `. Biggest is ${cluster.biggestBillName} at ${formatCurrency(cluster.biggestBillAmount)}.` : "."}
        </Aside>
      )}
    </div>
  );
}

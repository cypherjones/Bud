import { TotalsStrip, Total } from "@/components/plan/plan-ui";
import { formatCurrencyCompact } from "@/lib/utils/format";

type Props = {
  credit: { latest: { score: number; date: string }; change: number; tier: string; factors: { utilizationRatio: number | null } | null | undefined } | null;
  tax: { totalOwed: number; nextDue: { agency: string; remainingBalance: number; dueDate: string | null } | null; count: number };
};

const day = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function CreditTaxStrip({ credit, tax }: Props) {
  const util = credit?.factors?.utilizationRatio ?? null;
  return (
    <TotalsStrip cols={2}>
      <Total
        href="/credit"
        label="Credit score"
        value={credit ? String(credit.latest.score) : "—"}
        tone={credit && credit.change < 0 ? "text-red-400" : undefined}
        note={
          credit
            ? `${credit.tier}${credit.change !== 0 ? ` · ${credit.change > 0 ? "+" : ""}${credit.change} since last` : ""}${util !== null ? ` · ${Math.round(util * 100)}% utilization` : ""}`
            : "no score logged yet"
        }
      />
      <Total
        href="/tax"
        label="Tax owed"
        value={formatCurrencyCompact(tax.totalOwed)}
        tone={tax.totalOwed > 0 ? "text-amber-400" : undefined}
        note={
          tax.nextDue
            ? `${tax.nextDue.agency}${tax.nextDue.dueDate ? ` due ${day(tax.nextDue.dueDate)}` : ""} · ${tax.count} ${tax.count === 1 ? "obligation" : "obligations"} open`
            : tax.count > 0 ? `${tax.count} ${tax.count === 1 ? "obligation" : "obligations"} open, no due date` : "nothing open"
        }
      />
    </TotalsStrip>
  );
}

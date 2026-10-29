import { TotalsStrip, Total } from "@/components/plan/plan-ui";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils/format";

type Props = {
  credit: { score: number; date: string; monthsOld: number; tier: string; cardUsePct: number | null } | null;
  irs: { balance: number; monthly: number; dueDate: string; nextDueDate: string; paidOn: string | null; daysLate: number } | null;
};

const day = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function CreditTaxStrip({ credit, irs }: Props) {
  return (
    <TotalsStrip cols={2}>
      <Total
        href="/credit"
        label="Credit score"
        value={credit ? String(credit.score) : "—"}
        tone={credit && credit.score < 580 ? "text-red-400" : undefined}
        note={
          credit
            ? `${credit.tier} · as of ${day(credit.date)}${credit.monthsOld >= 2 ? `, ${credit.monthsOld} months old` : ""}${credit.cardUsePct !== null ? ` · cards ${credit.cardUsePct}% used today` : ""}`
            : "no score logged yet"
        }
      />
      <Total
        href="/tax"
        label="IRS installment"
        value={irs ? formatCurrencyCompact(irs.balance) : "$0"}
        tone={irs && irs.daysLate > 0 ? "text-red-400" : irs ? "text-amber-400" : undefined}
        note={
          irs
            ? irs.paidOn
              ? `${formatCurrency(irs.monthly)} paid ${day(irs.paidOn)} · next ${day(irs.nextDueDate)}`
              : `${formatCurrency(irs.monthly)} due ${day(irs.dueDate)}, no payment seen${irs.daysLate > 0 ? ` (${irs.daysLate} days)` : ""}`
            : "nothing owed"
        }
      />
    </TotalsStrip>
  );
}

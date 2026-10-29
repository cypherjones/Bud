import Link from "next/link";
import { TotalsStrip, Total } from "@/components/plan/plan-ui";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils/format";

type Props = {
  rows: { name: string; balance: number; estimated: boolean; apr: number | null }[];
  owed: number;
  monthly: number;
  debtFree: { months: number; month: string } | null;
  unpaid: string[];
};

export function DebtsSection({ rows, owed, monthly, debtFree, unpaid }: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No debts tracked. Add them on <Link href="/debts" className="underline decoration-dotted underline-offset-2">Debts</Link>.</p>;
  }
  const sorted = [...rows].sort((a, b) => b.balance - a.balance);
  return (
    <div className="space-y-3">
      <TotalsStrip cols={3}>
        <Total href="/debts" label="Still owed" value={formatCurrencyCompact(owed)} note={unpaid.length ? `Not counting ${unpaid.join(", ")}, which isn't being paid` : `across ${rows.length} debts`} />
        <Total href="/budget" label="Paid each month" value={formatCurrencyCompact(monthly)} note="The budget's debt lines" />
        <Total href="/debts" label="Debt-free" value={debtFree?.month ?? "—"} note={debtFree ? `${debtFree.months} months at the budget's payments` : "Payments don't cover the interest"} />
      </TotalsStrip>
      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <table className="w-full text-sm">
          <tbody>
            {sorted.map((d) => (
              <tr key={d.name} className="border-b border-border last:border-b-0">
                <td className="py-1.5 pr-3">{d.name}</td>
                <td className="py-1.5 pr-3 text-right text-muted-foreground whitespace-nowrap">{d.apr !== null ? `${(d.apr * 100).toFixed(1)}%` : ""}</td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {formatCurrency(d.balance)}
                  {d.estimated && <span className="ml-1 text-[11px] text-muted-foreground">est.</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

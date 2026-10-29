import Link from "next/link";
import { TotalsStrip, Total } from "@/components/plan/plan-ui";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils/format";

type Debt = { creditorName: string; currentBalance: number; originalBalance: number; interestRate: number; type: string };

type Props = {
  debts: Debt[];
  totalActive: number;
  totalOriginal: number;
  progress: number;
  debtFreeAt: string | null;
  debtFreeMonths: number | null;
};

const month = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
};

export function DebtsSection({ debts, totalActive, totalOriginal, progress, debtFreeAt, debtFreeMonths }: Props) {
  if (debts.length === 0) {
    return <p className="text-sm text-muted-foreground">No debts tracked. Add them on <Link href="/debts" className="underline decoration-dotted underline-offset-2">Debts</Link>.</p>;
  }
  const sorted = [...debts].sort((a, b) => b.currentBalance - a.currentBalance);
  return (
    <div className="space-y-3">
      <TotalsStrip cols={3}>
        <Total href="/debts" label="Still owed" value={formatCurrencyCompact(totalActive)} note={`across ${debts.length} ${debts.length === 1 ? "debt" : "debts"}`} />
        <Total href="/debts" label="Paid off" value={`${progress}%`} note={`${formatCurrencyCompact(totalOriginal - totalActive)} of ${formatCurrencyCompact(totalOriginal)}`} />
        <Total href="/debts" label="Debt-free" value={debtFreeAt ? month(debtFreeAt) : "—"} note={debtFreeMonths !== null ? `${debtFreeMonths} months at the current pace` : "no pace to project from"} />
      </TotalsStrip>
      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <table className="w-full text-sm">
          <tbody>
            {sorted.map((d) => (
              <tr key={d.creditorName} className="border-b border-border last:border-b-0">
                <td className="py-1.5 pr-3">{d.creditorName}</td>
                <td className="py-1.5 pr-3 text-right text-muted-foreground whitespace-nowrap">{(d.interestRate * 100).toFixed(1)}%</td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{formatCurrency(d.currentBalance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import Link from "next/link";
import { LedgerRow } from "@/components/plan/plan-ui";
import { formatCurrencyCompact } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

const usd = (dollars: number) => formatCurrencyCompact(Math.round(dollars * 100));

type Row = { id: string; label: string; planned: number; spent: number; over: number };

type Props = {
  tracked: Row[];
  spentTotal: number; // dollars, every category
  spentTracked: number;
  untracked: Array<{ name: string; dollars: number }>; // categories with no tracked line, biggest first
  daysElapsed: number;
  daysInMonth: number;
};

/** This month's spending, line by line against the plan. */
export function WhereItWent({ tracked, spentTotal, spentTracked, untracked, daysElapsed, daysInMonth }: Props) {
  const rows = [...tracked].filter((r) => r.spent > 0 || r.planned > 0).sort((a, b) => b.spent - a.spent).slice(0, 12);
  const elsewhere = Math.max(0, spentTotal - spentTracked);
  const frac = daysInMonth > 0 ? daysElapsed / daysInMonth : 0;

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="py-1 pr-3 text-left font-semibold">Line</th>
            <th className="py-1 pl-3 text-right font-semibold">Plan</th>
            <th className="py-1 pl-3 text-right font-semibold">Spent</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const ahead = r.spent > r.planned * frac && r.spent <= r.planned;
            return (
              <tr key={r.id} className={cn(r.over > 0 && "text-red-400")}>
                <td className="py-1 pr-3">
                  {r.label}
                  {r.over > 0 && <span className="ml-2 text-[11px]">+{usd(r.over)} over</span>}
                  {ahead && <span className="ml-2 text-[11px] text-amber-400">ahead of pace</span>}
                </td>
                <td className="py-1 pl-3 text-right font-mono tabular-nums text-muted-foreground whitespace-nowrap">{usd(r.planned)}</td>
                <td className="py-1 pl-3 text-right font-mono tabular-nums whitespace-nowrap">{usd(r.spent)}</td>
              </tr>
            );
          })}
          {elsewhere > 0 && (
            <tr className="text-muted-foreground">
              <td className="py-1 pr-3">
                Not on a tracked line
                {untracked.length > 0 && (
                  <span className="block text-[11px]">
                    {untracked.slice(0, 4).map((u) => `${u.name} ${usd(u.dollars)}`).join(" · ")}
                  </span>
                )}
              </td>
              <td className="py-1 pl-3 text-right font-mono tabular-nums">—</td>
              <td className="py-1 pl-3 text-right font-mono tabular-nums whitespace-nowrap">{usd(elsewhere)}</td>
            </tr>
          )}
          <LedgerRow label="Everything this month" value={usd(spentTotal)} total />
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Plan numbers come from <Link href="/budget" className="underline decoration-dotted underline-offset-2">the budget</Link>; a line tracks a category once it is linked there.
        Anything in Other is a merchant Bud couldn&apos;t place.
      </p>
    </div>
  );
}

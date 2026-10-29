import { SectionHead, TotalsStrip, Total, LedgerRow } from "@/components/plan/plan-ui";
import { formatCurrency } from "@/lib/utils/format";

type Props = {
  summary: {
    expenses: number;
    income: number;
    prevExpenses: number;
    prevIncome: number;
    isPartialMonth: boolean;
    savingsRate: number;
    topCategories: { name: string | null; color: string | null; total: number; count: number }[];
    topMerchants: { merchant: string | null; total: number; count: number }[];
  };
  velocity: {
    dailyRate: number;
    daysElapsed: number;
    daysRemaining: number;
  };
};

const signed = (cents: number) => `${cents < 0 ? "−" : "+"}${formatCurrency(Math.abs(cents))}`;
const pct = (now: number, then: number) => (then > 0 ? Math.round(((now - then) / then) * 100) : null);

/** The month so far against the same days last month. Card payments and
 *  transfers between accounts are already left out upstream. */
export function MonthlySummary({ summary, velocity }: Props) {
  const net = summary.income - summary.expenses;
  const prevNet = summary.prevIncome - summary.prevExpenses;
  const inDelta = pct(summary.income, summary.prevIncome);
  const outDelta = pct(summary.expenses, summary.prevExpenses);
  const window = summary.isPartialMonth ? "the same days last month" : "last month";
  const vs = (d: number | null) => (d === null ? undefined : `${d >= 0 ? "+" : ""}${d}% vs ${window}`);

  return (
    <div className="space-y-10">
      <TotalsStrip cols={4}>
        <Total label="Came in" value={formatCurrency(summary.income)} tone="text-emerald-400" note={vs(inDelta)} />
        <Total
          label="Went out"
          value={formatCurrency(summary.expenses)}
          tone={outDelta !== null && outDelta > 10 ? "text-amber-400" : undefined}
          note={vs(outDelta)}
        />
        <Total
          label="Net"
          value={signed(net)}
          tone={net < 0 ? "text-red-400" : "text-emerald-400"}
          note={`${signed(prevNet)} by this point ${summary.isPartialMonth ? "last month" : "the month before"}`}
        />
        <Total
          label="Spent a day"
          value={formatCurrency(velocity.dailyRate)}
          note={summary.isPartialMonth ? `${velocity.daysElapsed} days in, ${velocity.daysRemaining} left` : "averaged over the month"}
        />
      </TotalsStrip>

      <div className="grid gap-10 md:grid-cols-2">
        <section className="space-y-3">
          <SectionHead title="Where it went" sub="Spending by category." />
          {summary.topCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing categorized yet.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {summary.topCategories.slice(0, 8).map((c, i) => (
                  <LedgerRow
                    key={i}
                    label={
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color ?? "#6b7280" }} />
                        <span className="truncate">{c.name ?? "Uncategorized"}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{c.count}×</span>
                      </span>
                    }
                    value={formatCurrency(c.total)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="space-y-3">
          <SectionHead title="Who got it" sub="Biggest merchants, with the bank's spellings merged." />
          {summary.topMerchants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No merchants yet.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {summary.topMerchants.map((m, i) => (
                  <LedgerRow
                    key={i}
                    label={
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{m.merchant ?? "Unknown"}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{m.count}×</span>
                      </span>
                    }
                    value={formatCurrency(m.total)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

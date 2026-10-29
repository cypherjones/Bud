import { TotalsStrip, Total } from "@/components/plan/plan-ui";
import { formatCurrencyCompact } from "@/lib/utils/format";

const usd = (dollars: number) => formatCurrencyCompact(Math.round(dollars * 100));

type Props = {
  planNet: number; // dollars a month the plan leaves over
  planOut: number;
  planSavings: number;
  planMoneyIn: number;
  spentCents: number;
  projectedCents: number | null;
  daysElapsed: number;
  daysInMonth: number;
  plannedTracked: number; // dollars
  spentTracked: number;
  trackedCount: number;
  lineCount: number;
  overLines: Array<{ id: string; label: string; over: number }>;
  overTotal: number;
  balanceCents: number | null;
  accountCount: number;
  incomeCents: number | null;
  incomeTrend: number | null;
};

/** The spine of the home page: what the plan says, what has happened so far
 *  this month, and where the two disagree. Every tile opens the page that
 *  owns the number. */
export function MonthStrip(p: Props) {
  const monthPct = p.daysInMonth > 0 ? Math.round((p.daysElapsed / p.daysInMonth) * 100) : 0;
  const pace = p.plannedTracked * (p.daysInMonth > 0 ? p.daysElapsed / p.daysInMonth : 0);
  const over = p.overLines.slice(0, 2).map((l) => `${l.label} +${usd(l.over)}`).join(" · ");
  const trend = p.incomeTrend === null ? "" : ` · ${p.incomeTrend >= 0 ? "+" : ""}${p.incomeTrend}% vs the 30 before`;

  return (
    <TotalsStrip cols={6}>
      <Total
        href="/budget"
        label="Plan says"
        value={usd(p.planNet)}
        tone={p.planNet >= 0 ? "text-emerald-400" : "text-red-400"}
        note={`left over a month, after ${usd(p.planOut)} of bills and ${usd(p.planSavings)} saved`}
      />
      <Total
        href="/transactions"
        label="Spent so far"
        value={formatCurrencyCompact(p.spentCents)}
        note={p.projectedCents !== null ? `day ${p.daysElapsed} of ${p.daysInMonth} · on pace for ${formatCurrencyCompact(p.projectedCents)}` : `day ${p.daysElapsed} of ${p.daysInMonth}`}
      />
      <Total
        href="/budget"
        label="Against the plan"
        value={`${usd(p.spentTracked)} of ${usd(p.plannedTracked)}`}
        tone={p.spentTracked > pace ? "text-amber-400" : undefined}
        note={`${p.trackedCount} of ${p.lineCount} lines tracked · month ${monthPct}% through`}
      />
      <Total
        href="/budget"
        label="Over plan"
        value={p.overLines.length === 0 ? "None" : `${p.overLines.length} ${p.overLines.length === 1 ? "line" : "lines"}`}
        tone={p.overLines.length > 0 ? "text-red-400" : "text-emerald-400"}
        note={p.overLines.length === 0 ? "no tracked line past its number yet" : `${usd(p.overTotal)} over · ${over}`}
      />
      <Total
        href="/settings"
        label="In the bank"
        value={p.balanceCents === null ? "—" : formatCurrencyCompact(p.balanceCents)}
        note={p.balanceCents === null ? "connect an account to start" : `across ${p.accountCount} ${p.accountCount === 1 ? "account" : "accounts"}`}
      />
      <Total
        href="/transactions"
        label="Income, 30 days"
        value={p.incomeCents === null ? "—" : formatCurrencyCompact(p.incomeCents)}
        note={p.incomeCents === null ? "connect an account to start" : `plan counts ${usd(p.planMoneyIn)} a month${trend}`}
      />
    </TotalsStrip>
  );
}

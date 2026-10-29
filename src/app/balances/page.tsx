import Link from "next/link";
import { PlanPage, SectionHead, TotalsStrip, Total, Aside } from "@/components/plan/plan-ui";
import { getBalances, type AccountBalance } from "@/lib/actions/balances";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const day = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const QUIET_DAYS = 14;

export default function BalancesPage() {
  const all = getBalances();
  const counted = all.filter((a) => a.counted && a.syncing);
  // A dead feed's number is history, not a balance, whether or not it counts.
  const stopped = all.filter((a) => !a.syncing);
  const cash = counted.filter((a) => a.kind === "checking" || a.kind === "other").sort((a, b) => b.balanceCents - a.balanceCents);
  const savings = counted.filter((a) => a.kind === "savings").sort((a, b) => b.balanceCents - a.balanceCents);
  const cards = counted.filter((a) => a.kind === "card").sort((a, b) => b.balanceCents - a.balanceCents);
  const excluded = all.filter((a) => !a.counted && a.syncing);

  const sum = (xs: AccountBalance[]) => xs.reduce((s, a) => s + a.balanceCents, 0);
  const checkingTotal = sum(cash);
  const savingsTotal = sum(savings);
  const cardsTotal = sum(cards);
  const lastSync = counted.map((a) => a.lastSynced).filter((s): s is string => !!s).sort().at(-1) ?? null;
  // Checking accounts move weekly; a quiet one usually means a dark feed. Savings are quiet by nature.
  const quiet = cash.filter((a) => a.kind === "checking" && a.daysQuiet !== null && a.daysQuiet > QUIET_DAYS);
  const syncedAt = lastSync ? new Date(lastSync).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never";

  return (
    <PlanPage
      title="Balances"
      sub={<>Every account Bud syncs, as of the last sync on {syncedAt}. Loans and their payoff are on <Link href="/debts" className="underline decoration-dotted underline-offset-2">Debts</Link>.</>}
    >
      <TotalsStrip cols={4}>
        <Total label="Checking" value={formatCurrencyCompact(checkingTotal)} note={`across ${cash.length} ${cash.length === 1 ? "account" : "accounts"}`} />
        <Total label="Savings" value={formatCurrencyCompact(savingsTotal)} tone={savingsTotal < 50000 ? "text-amber-400" : undefined} note={`across ${savings.length} ${savings.length === 1 ? "account" : "accounts"}`} />
        <Total label="Owed on cards" value={formatCurrencyCompact(cardsTotal)} tone={cardsTotal > 0 ? "text-red-400" : "text-emerald-400"} note={cardsTotal > 0 ? "as the card feeds report it" : "every card at zero"} />
        <Total label="Cash, all in" value={formatCurrencyCompact(checkingTotal + savingsTotal)} note={cardsTotal > 0 ? `${formatCurrencyCompact(checkingTotal + savingsTotal - cardsTotal)} after the cards` : "nothing owed on cards"} />
      </TotalsStrip>

      {quiet.length > 0 && (
        <Aside tone="warn" title={`${quiet.length === 1 ? "A checking account has" : `${quiet.length} checking accounts have`} gone quiet`}>
          {quiet.map((a) => `${a.name} has had no activity since ${day(a.lastActivity!)}`).join(". ")}. {quiet.length === 1 ? "Its balance" : "Their balances"} may be out of date; check the bank&apos;s app before relying on {quiet.length === 1 ? "it" : "them"}.
        </Aside>
      )}

      <section className="space-y-3">
        <SectionHead title="Checking" sub="The low is the lowest end-of-day balance in the last 30 days, worked back from today's balance." />
        <AccountTable rows={cash} withLow total={checkingTotal} />
      </section>

      <section className="space-y-3">
        <SectionHead title="Savings" />
        <AccountTable rows={savings} withLow total={savingsTotal} />
      </section>

      <section className="space-y-3">
        <SectionHead title="Cards" sub="What each card feed says is owed. Apple Card's feed updates once a month, after the statement." />
        <AccountTable rows={cards} total={cardsTotal} />
      </section>

      {stopped.length > 0 && (
        <section className="space-y-3">
          <SectionHead title="No longer syncing" sub="These feeds stopped updating while the others kept going. The last number each one sent is shown only as history and is left out of every total. Reconnect or remove them in Settings." />
          <AccountTable rows={stopped} />
        </section>
      )}

      {excluded.length > 0 && (
        <section className="space-y-3">
          <SectionHead title="Not counted" sub="Excluded from every total in Bud. Change that in Settings." />
          <AccountTable rows={excluded} />
        </section>
      )}
    </PlanPage>
  );
}

function AccountTable({ rows, withLow, total }: { rows: AccountBalance[]; withLow?: boolean; total?: number }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">None.</p>;
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="py-1 pr-3 text-left font-semibold">Account</th>
            <th className="py-1 pl-3 text-right font-semibold">Balance</th>
            {withLow && <th className="hidden sm:table-cell py-1 pl-3 text-right font-semibold">30-day low</th>}
            <th className="py-1 pl-3 text-right font-semibold">Last activity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const quiet = a.daysQuiet !== null && a.daysQuiet > QUIET_DAYS;
            return (
              <tr key={a.id} className={cn("border-b border-border last:border-b-0", !a.counted && "text-muted-foreground")}>
                <td className="py-1.5 pr-3">
                  {a.name}

                  {a.paidSinceFeed && (
                    <span className="block text-[11px] text-emerald-400">
                      Paid {day(a.paidSinceFeed.date)}. The card feed still shows {formatCurrency(a.paidSinceFeed.feedBalanceCents)} until the next statement.
                    </span>
                  )}
                  {!a.syncing && a.lastSynced && (
                    <span className="block text-[11px] text-muted-foreground">
                      Feed stopped {day(a.lastSynced.slice(0, 10))}. It showed {formatCurrency(a.balanceCents)} then.
                    </span>
                  )}
                  {withLow && a.low30 && (
                    <span className={cn("sm:hidden block text-[11px]", a.low30.cents < 0 ? "text-red-400" : "text-muted-foreground")}>
                      low {formatCurrency(a.low30.cents)} on {day(a.low30.date)}
                    </span>
                  )}
                </td>
                <td className={cn(
                  "py-1.5 pl-3 text-right font-mono tabular-nums whitespace-nowrap",
                  !a.syncing ? "text-muted-foreground" : (a.kind === "card" ? a.balanceCents > 0 : a.balanceCents < 0) && "text-red-400",
                )}>
                  {a.syncing ? formatCurrency(a.balanceCents) : "unknown"}
                </td>
                {withLow && (
                  <td className={cn("hidden sm:table-cell py-1.5 pl-3 text-right font-mono tabular-nums whitespace-nowrap", a.low30 && a.low30.cents < 0 ? "text-red-400" : "text-muted-foreground")}>
                    {a.low30 ? `${formatCurrency(a.low30.cents)} · ${day(a.low30.date)}` : "—"}
                  </td>
                )}
                <td className={cn("py-1.5 pl-3 text-right whitespace-nowrap text-[13px]", quiet ? "text-amber-400" : "text-muted-foreground")}>
                  {a.lastActivity ? (a.daysQuiet === 0 ? "today" : a.daysQuiet === 1 ? "yesterday" : `${day(a.lastActivity)} · ${a.daysQuiet}d`) : "none"}
                </td>
              </tr>
            );
          })}
          {total !== undefined && rows.length > 1 && (
            <tr className="font-semibold">
              <td className="pt-2 pr-3 border-t border-border">Total</td>
              <td className="pt-2 pl-3 text-right font-mono tabular-nums border-t border-border">{formatCurrency(total)}</td>
              {withLow && <td className="hidden sm:table-cell border-t border-border" />}
              <td className="border-t border-border" />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

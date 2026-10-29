import Link from "next/link";
import { PlanPage, SectionHead, TotalsStrip, Total, Aside, LedgerRow } from "@/components/plan/plan-ui";
import { loadPlan } from "@/lib/household/load";
import { monthAhead, type AheadDay } from "@/lib/household/month-ahead";
import { rollRecurringForward } from "@/lib/actions/recurring";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const day = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const shortDay = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const signed = (c: number) => `${c >= 0 ? "+" : "−"}${formatCurrency(Math.abs(c))}`;

export default function NextMonthPage() {
  rollRecurringForward();
  const { config, lines } = loadPlan();
  const a = monthAhead(lines, config.income);
  const monthName = new Date(a.monthStart + "T00:00:00").toLocaleDateString("en-US", { month: "long" });
  const thisMonthName = new Date(a.today + "T00:00:00").toLocaleDateString("en-US", { month: "long" });
  const outTotal = a.outScheduledCents + a.spreadCents;
  const net = a.inCents - outTotal;
  const unseen = a.days.flatMap((d) => d.events).filter((e) => !e.seen && e.cents < 0);

  return (
    <PlanPage
      title={`${monthName}, ahead`}
      sub={
        <>
          From today&apos;s cash, through every dated bill and paycheck on the schedule, to the end of {monthName}. Spending the{" "}
          <Link href="/budget" className="underline decoration-dotted underline-offset-2">budget</Link> carries without a date is spread evenly across the days.
        </>
      }
    >
      <TotalsStrip cols={5}>
        <Total href="/transactions" label="Cash today" value={formatCurrencyCompact(a.cashTodayCents)} note={`${formatCurrencyCompact(a.cashAtMonthStartCents)} going into ${shortDay(a.monthStart)}, ${formatCurrencyCompact(a.cashEndFirstDayCents)} after its bills`} />
        <Total label="Coming in" value={formatCurrencyCompact(a.inCents)} tone="text-emerald-400" note={`in ${monthName}, from the schedule`} />
        <Total label="Going out" value={formatCurrencyCompact(outTotal)} note={`${formatCurrencyCompact(a.outScheduledCents)} dated, ${formatCurrencyCompact(a.spreadCents)} day to day`} />
        <Total label={`End of ${monthName}`} value={formatCurrencyCompact(a.endCents)} tone={a.endCents < 0 ? "text-red-400" : undefined} note={`${net >= 0 ? "+" : "−"}${formatCurrencyCompact(Math.abs(net))} over the month`} />
        <Total label="Lowest point" value={formatCurrencyCompact(a.lowest.cents)} tone={a.lowest.cents < 0 ? "text-red-400" : a.lowest.cents < 50000 ? "text-amber-400" : undefined} note={day(a.lowest.date)} />
      </TotalsStrip>

      {a.firstNegative && (
        <Aside tone="warn" title={`Cash goes below zero on ${day(a.firstNegative)}`}>
          Across every account combined. It bottoms out at {formatCurrency(a.lowest.cents)} on {day(a.lowest.date)}
          {a.endCents >= 0 ? ` and the last payday brings it back to ${formatCurrency(a.endCents)}` : ` and is still ${formatCurrency(a.endCents)} at the end of the month`}.
          Something has to move: a bill&apos;s date, a transfer in, or a cut from the budget.
        </Aside>
      )}

      <section className="space-y-3">
        <SectionHead title="Day by day" sub={`Every dated item, with cash across all accounts at the end of each day. Day-to-day spending of ${formatCurrency(a.dailySpreadCents)} a day is already taken out of each balance.`} />
        <div className="rounded-xl border border-border bg-card px-4 py-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-1 pr-3 text-left font-semibold">Day</th>
                <th className="py-1 pr-3 text-left font-semibold">What</th>
                <th className="py-1 pl-3 text-right font-semibold">Amount</th>
                <th className="py-1 pl-3 text-right font-semibold">Cash after</th>
              </tr>
            </thead>
            <tbody>
              {a.leadIn.length > 0 && <MonthRow label={`Rest of ${thisMonthName}`} />}
              {a.leadIn.map((d) => <DayRows key={d.date} d={d} />)}
              <MonthRow label={monthName} />
              {a.days.map((d) => <DayRows key={d.date} d={d} />)}
            </tbody>
          </table>
          {unseen.length > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Marked <span className="text-amber-400">plan</span>: a figure from the budget that hasn&apos;t shown up in a synced account yet, so its day is a guess.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHead title="Spread across the month" sub="Budget lines with no date, or more than the schedule covers. Their total is taken out a little each day." />
        <div className="rounded-xl border border-border bg-card px-4 py-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-1 pr-3 text-left font-semibold">Lines</th>
                <th className="py-1 pl-3 text-right font-semibold">Budget</th>
                <th className="py-1 pl-3 text-right font-semibold">On a date</th>
                <th className="py-1 pl-3 text-right font-semibold">Spread</th>
              </tr>
            </thead>
            <tbody>
              {a.spread.map((r) => (
                <tr key={r.category + r.labels.join()} className="border-b border-border last:border-b-0">
                  <td className="py-1.5 pr-3">
                    {r.labels.join(", ")}
                    <span className="ml-2 text-[11px] text-muted-foreground">{r.category}</span>
                  </td>
                  <td className="py-1.5 pl-3 text-right font-mono tabular-nums whitespace-nowrap text-muted-foreground">{formatCurrency(r.plannedCents)}</td>
                  <td className="py-1.5 pl-3 text-right font-mono tabular-nums whitespace-nowrap text-muted-foreground">{r.scheduledCents > 0 ? formatCurrency(r.scheduledCents) : "—"}</td>
                  <td className="py-1.5 pl-3 text-right font-mono tabular-nums whitespace-nowrap">{formatCurrency(r.spreadCents)}</td>
                </tr>
              ))}
              <LedgerRow label={`${formatCurrency(a.dailySpreadCents)} a day`} value={formatCurrency(a.spreadCents)} total />
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHead title="Against the budget" sub="The budget is a typical month. This is the actual calendar month, so they differ by weekly bills and anything the schedule hasn't caught up with." />
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <table className="w-full text-sm">
            <tbody>
              <LedgerRow label="Budget, money in" value={formatCurrency(a.planMoneyInCents)} />
              <LedgerRow label={`${monthName}, money in`} value={formatCurrency(a.inCents)} />
              <LedgerRow label="Budget, going out" value={formatCurrency(a.planOutCents)} />
              <LedgerRow label={`${monthName}, going out`} value={formatCurrency(outTotal)} />
              <LedgerRow label={`${monthName} against a budget month`} value={signed(net - (a.planMoneyInCents - a.planOutCents))} total />
            </tbody>
          </table>
          {a.planSavingsCents > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              The budget also sets aside {formatCurrency(a.planSavingsCents)} for savings. It isn&apos;t taken out here, because it stays in the cash figures until it&apos;s moved.
            </p>
          )}
        </div>
      </section>
    </PlanPage>
  );
}

function MonthRow({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={4} className="pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</td>
    </tr>
  );
}

function DayRows({ d }: { d: AheadDay }) {
  return (
    <>
      {d.events.map((e, i) => {
        const lastRow = i === d.events.length - 1;
        return (
          <tr key={`${d.date}-${i}`} className={cn(lastRow && "border-b border-border")}>
            <td className="py-1 pr-3 whitespace-nowrap text-muted-foreground text-[13px]">{i === 0 ? day(d.date) : ""}</td>
            <td className="py-1 pr-3">
              {e.label}
              {!e.seen && e.cents < 0 && <span className="ml-2 text-[11px] text-amber-400">plan</span>}
            </td>
            <td className={cn("py-1 pl-3 text-right font-mono tabular-nums whitespace-nowrap", e.cents > 0 && "text-emerald-400")}>{signed(e.cents)}</td>
            <td className={cn("py-1 pl-3 text-right font-mono tabular-nums whitespace-nowrap", d.balanceCents < 0 && "text-red-400")}>
              {lastRow ? formatCurrency(d.balanceCents) : ""}
            </td>
          </tr>
        );
      })}
    </>
  );
}

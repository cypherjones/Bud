"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrencyCompact } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { salonMonth, salonWeekFor, JOINT_MARGINAL_RATE } from "@/lib/business/calc";
import type { SalonPlan } from "@/lib/business/config";
import { NumberField, usePlanSaver, SaveIndicator } from "./plan-inputs";
import { Aside, LedgerRow, SectionHead, TotalsStrip, Total } from "./plan-ui";

const usd = (dollars: number) => formatCurrencyCompact(Math.round(dollars * 100));
const signed = (dollars: number) => `${dollars < 0 ? "−" : "+"}${usd(Math.abs(dollars))}`;
const WEEKS_A_MONTH = 52 / 12;
const wk = (monthly: number) => monthly / WEEKS_A_MONTH;

// Her own plan, before the cuts and the band she set for costs
const COSTS_BEFORE_CUTS = 466;
const COST_TARGET = { low: 280, high: 320 };

type Bucket = { key: "tithePct" | "ownerPayPct" | "opexPct" | "profitPct" | "taxPct"; label: string; why: string; amount: number };

export function SalonPlanner({
  initial,
  taxHerProfit,
  budgetNet,
  herNet,
  householdTithePct,
}: {
  initial: SalonPlan;
  taxHerProfit: number;
  budgetNet: number; // the budget's monthly left-over without her pay
  herNet: number; // what the budget counts for her now
  householdTithePct: number;
}) {
  const [s, setS] = useState(initial);
  const [taxProfit, setTaxProfit] = useState(taxHerProfit);
  const [inBudget, setInBudget] = useState(herNet);
  const { state, send, schedule } = usePlanSaver();
  const m = salonMonth(s);
  const atTarget = salonMonth(s, s.weeklyTarget);

  const set = (patch: Partial<SalonPlan>) => {
    const next = { ...s, ...patch };
    setS(next);
    schedule("salon", () => send("/api/business/config", "PATCH", { salon: next }));
  };

  // The budget's tithe line takes its share of anything counted as income,
  // her pay included, so only (1 − tithe) of her pay closes the gap.
  const keep = 1 - householdTithePct / 100;
  const gapBefore = budgetNet + inBudget * keep; // left over with her pay taken back out
  const withHer = gapBefore + m.home * keep;
  const needHome = gapBefore < 0 && keep > 0 ? -gapBefore / keep : 0;
  const weekToClose = needHome > 0 ? salonWeekFor(s, needHome) : null;

  const home = Math.round(Math.max(0, m.home));
  const useInBudget = async () => {
    if (await send("/api/household/config", "PATCH", { income: { herNet: home } })) setInBudget(home);
  };
  const profitYear = Math.round(Math.max(0, m.annualProfit));
  const useOnTax = async () => {
    if (await send("/api/household/config", "PATCH", { tax: { herProfit: profitYear } })) setTaxProfit(profitYear);
  };

  const buckets: Bucket[] = [
    { key: "tithePct", label: "Tithe", why: "Off the top of every client", amount: m.buckets.tithe },
    { key: "ownerPayPct", label: "Her pay", why: "What comes home", amount: m.buckets.ownerPay },
    { key: "opexPct", label: "Running costs", why: "High early, will shrink", amount: m.buckets.opex },
    { key: "profitPct", label: "Profit", why: "Small but kept", amount: m.buckets.profit },
    { key: "taxPct", label: "Tax", why: "Nothing is withheld for her", amount: m.buckets.tax },
  ];
  const costsWeek = wk(m.costs);
  const perDay = s.daysPerWeek > 0 ? m.grossWeek / s.daysPerWeek : 0;
  const targetPerDay = s.daysPerWeek > 0 ? s.weeklyTarget / s.daysPerWeek : 0;

  return (
    <div className="space-y-10">
      <TotalsStrip cols={4}>
        <Total
          label="Takings a week"
          value={usd(m.grossWeek)}
          note={`${s.clientsPerWeek} clients over ${s.daysPerWeek} days · her goal is ${usd(s.weeklyTarget)}`}
        />
        <Total
          label="Costs a week"
          value={usd(costsWeek)}
          tone={costsWeek > COST_TARGET.high ? "text-amber-400" : undefined}
          note={`her target is ${usd(COST_TARGET.low)}–${usd(COST_TARGET.high)}`}
        />
        <Total
          label="Her pay a month"
          value={usd(m.home)}
          tone={m.home < 0 ? "text-red-400" : "text-emerald-400"}
          note={m.opexOver > 0 ? `${s.ownerPayPct}% of takings, less ${usd(m.opexOver)} of costs past the ${s.opexPct}%` : `${s.ownerPayPct}% of takings`}
        />
        <Total
          label="Budget with her pay"
          value={signed(withHer)}
          tone={withHer < 0 ? "text-red-400" : "text-emerald-400"}
          note={`${signed(gapBefore)} a month without it`}
        />
      </TotalsStrip>

      <section className="space-y-3">
        <SectionHead id="chair" title="The chair" sub="A booth-rental chair: she keeps what clients pay and owes the booth rent every week. Change any box; it saves for both of you." />
        <Card>
          <CardContent className="grid grid-cols-2 lg:grid-cols-5 gap-4 pt-1">
            <NumberField id="ticket" label="Average ticket" step={5} value={s.avgTicket} onChange={(n) => set({ avgTicket: n })}
              hint="What a client pays on average, before tips." />
            <NumberField id="cpw" label="Clients a week" unit="#" value={s.clientsPerWeek} onChange={(n) => set({ clientsPerWeek: n })} />
            <NumberField id="days" label="Days a week" unit="#" value={s.daysPerWeek} onChange={(n) => set({ daysPerWeek: n })}
              hint={`${usd(perDay)} a day now.`} />
            <NumberField id="weeks" label="Weeks worked a year" unit="#" value={s.weeksWorked} onChange={(n) => set({ weeksWorked: n })}
              hint="Lower it for holidays and sick weeks; booth rent is still owed." />
            <NumberField id="proc" label="Card processing" unit="%" step={0.1} value={s.processingPct} onChange={(n) => set({ processingPct: n })}
              hint="What GlossGenius takes on card payments." />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHead
          id="costs"
          title="What the chair costs"
          sub={`Weekly, from her plan after the temporary cuts. Before the cuts it was ${usd(COSTS_BEFORE_CUTS)} a week.`}
        />
        <Card>
          <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
            <NumberField id="booth" label="Booth rent, weekly" step={5} value={s.boothRentWeekly} onChange={(n) => set({ boothRentWeekly: n })}
              hint="Her plan says $225; Bud had $250. Owed every week." />
            <NumberField id="supplies" label="Supplies, weekly" step={5} value={s.suppliesWeekly} onChange={(n) => set({ suppliesWeekly: n })}
              hint="Cut from $50." />
            <NumberField id="cleaning" label="Cleaning, weekly" step={5} value={s.cleaningWeekly} onChange={(n) => set({ cleaningWeekly: n })} />
            <NumberField id="marketing" label="Marketing, weekly" step={5} value={s.marketingWeekly} onChange={(n) => set({ marketingWeekly: n })}
              hint="Cut from $60; organic only beyond this." />
            <NumberField id="snacks" label="Snacks, weekly" step={5} value={s.snacksWeekly} onChange={(n) => set({ snacksWeekly: n })}
              hint="Paused." />
            <NumberField id="gas" label="Gas, weekly" step={5} value={s.gasWeekly} onChange={(n) => set({ gasWeekly: n })}
              hint="Her plan has $80. Driving to her own chair is commuting, not a business cost, and the budget's Fuel line already pays it." />
            <NumberField id="soft" label="GlossGenius, monthly" value={s.software} onChange={(n) => set({ software: n })} />
            <NumberField id="other" label="Anything else, monthly" step={10} value={s.other} onChange={(n) => set({ other: n })}
              hint="Licence renewal, insurance, classes." />
          </CardContent>
        </Card>
        <SaveIndicator state={state} />
      </section>

      <section className="space-y-3">
        <SectionHead
          id="split"
          title="Where each dollar goes"
          sub="Her Profit First split. Every bucket is a share of what clients pay, set aside as the money comes in."
        />
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          <div className="hidden sm:grid grid-cols-[1fr_6rem_6rem_6rem] gap-3 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Bucket</span><span>Share</span><span className="text-right">A week</span><span className="text-right">A month</span>
          </div>
          {buckets.map((b) => (
            <div key={b.key} className="grid grid-cols-[1fr_5.5rem] sm:grid-cols-[1fr_6rem_6rem_6rem] items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{b.label}</p>
                <p className="text-xs text-muted-foreground">{b.why}</p>
              </div>
              <NumberField id={`split_${b.key}`} unit="%" value={s[b.key]} onChange={(n) => set({ [b.key]: n } as Partial<SalonPlan>)} />
              <p className="col-span-2 sm:col-span-1 text-xs sm:text-sm text-muted-foreground sm:text-foreground sm:text-right font-mono tabular-nums">
                <span className="sm:hidden">{usd(wk(b.amount))} a week · {usd(b.amount)} a month</span>
                <span className="hidden sm:inline">{usd(wk(b.amount))}</span>
              </p>
              <p className="hidden sm:block text-right font-mono tabular-nums">{usd(b.amount)}</p>
            </div>
          ))}
          <div className={cn("px-4 py-2 text-xs", m.splitPct === 100 ? "text-muted-foreground" : "text-amber-500")}>
            {m.splitPct === 100 ? "Adds up to 100% of takings." : `Adds up to ${m.splitPct}%, not 100%.`}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Aside tone={m.opexOver > 0 ? "warn" : "good"} title={m.opexOver > 0 ? "Costs run past the bucket" : "Costs fit the bucket"}>
            <p>
              The {s.opexPct}% running-cost bucket holds {usd(wk(m.buckets.opex))} a week; the chair costs {usd(costsWeek)}.{" "}
              {m.opexOver > 0
                ? `The ${usd(wk(m.opexOver))} a week over comes out of her pay until takings rise.`
                : `${usd(wk(-m.opexOver))} a week is left in it.`}
            </p>
          </Aside>
          <Aside tone={m.taxShort > 0 ? "warn" : "good"} title={m.taxShort > 0 ? "The tax bucket is short" : "The tax bucket covers it"}>
            <p>
              On {usd(m.profit)} a month of profit, her tax comes to about {usd(m.taxNeed)} a month: {usd(m.tax.se / 12)} self-employment
              tax and {usd(m.tax.income / 12)} income tax at the joint return&apos;s {Math.round(JOINT_MARGINAL_RATE * 100)}% bracket, after the
              20% business deduction. The {s.taxPct}% bucket holds {usd(m.buckets.tax)}.
              {m.taxShort > 0 && ` About ${usd(m.taxShort)} a month short; about ${Math.ceil((m.taxNeed / Math.max(1, m.gross)) * 100)}% of takings covers it, or AJ's W-4 can.`}
            </p>
          </Aside>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHead id="target" title="What it takes" sub="Her goal, and what the household needs from the chair." />
        <Card>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-1">
            <div className="space-y-4">
              <NumberField id="goal" label="Her goal, takings a week" step={50} className="max-w-[220px]"
                value={s.weeklyTarget} onChange={(n) => set({ weeklyTarget: n })} />
              <table className="w-full text-sm">
                <tbody>
                  <LedgerRow label={`A day, at ${s.daysPerWeek} days a week`} value={usd(targetPerDay)} />
                  <LedgerRow label={`Clients a week at ${usd(s.avgTicket)}`} value={s.avgTicket > 0 ? (Math.ceil((s.weeklyTarget / s.avgTicket) * 10) / 10).toString() : "—"} />
                  <LedgerRow label="Her pay a month at the goal" value={usd(atTarget.home)} />
                  <LedgerRow label="Budget with that pay" value={signed(gapBefore + atTarget.home * keep)}
                    tone={gapBefore + atTarget.home * keep < 0 ? "text-red-400" : "text-emerald-400"} />
                </tbody>
              </table>
            </div>
            <div className="space-y-3 text-sm">
              <p className="font-medium">To close the budget&apos;s gap</p>
              {needHome <= 0 ? (
                <p className="text-muted-foreground">The budget balances without her pay.</p>
              ) : (
                <>
                  <p className="text-muted-foreground leading-relaxed">
                    The budget is {signed(gapBefore)} a month without her. Her pay would need to be {usd(needHome)}, because the budget&apos;s{" "}
                    {householdTithePct}% tithe line takes its share of it too.{" "}
                    {weekToClose === null
                      ? "Her pay share is zero, so no amount of takings gets there."
                      : `At a ${s.ownerPayPct}% pay share that takes ${usd(weekToClose)} a week of takings — ${usd(weekToClose / Math.max(1, s.daysPerWeek))} a day over ${s.daysPerWeek} days.`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Her plan already tithes on takings, so her pay is tithed twice once it&apos;s in the budget. Set one of the two to zero.
                  </p>
                </>
              )}
              <div className="pt-1 space-y-2">
                <p className="text-xs text-muted-foreground">
                  The budget counts <span className="font-mono">{usd(inBudget)}</span> a month for her.
                </p>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={useInBudget} disabled={home === Math.round(inBudget)}>
                  Count {usd(home)} a month in the budget
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHead id="tax" title="Her tax" sub="Self-employed, so nothing is withheld. On the joint return it comes out of the refund unless it's paid along the way." />
        <Card>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-1">
            <table className="w-full text-sm self-start">
              <tbody>
                <LedgerRow label="Profit over a year (Schedule C)" value={usd(m.annualProfit)} />
                <LedgerRow label="Self-employment tax" value={usd(m.tax.se)} />
                <LedgerRow label={`Income tax at ${Math.round(JOINT_MARGINAL_RATE * 100)}%`} value={usd(m.tax.income)} />
                <LedgerRow total label="Per quarter, if paid as estimates" value={usd(m.quarterly)} />
              </tbody>
            </table>
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground text-xs leading-relaxed">
                /tax is using <span className="font-mono">{usd(taxProfit)}</span> for her profit.
                {profitYear !== taxProfit && " This page says otherwise."}
              </p>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={useOnTax} disabled={profitYear === taxProfit}>
                Use {usd(profitYear)} on /tax
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

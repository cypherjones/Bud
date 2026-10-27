"use client";

import { useState } from "react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrencyCompact } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { salonMonth } from "@/lib/business/calc";
import type { SalonPlan } from "@/lib/business/config";
import { NumberField, usePlanSaver, SaveIndicator } from "./plan-inputs";
import { LedgerRow, SectionHead, TotalsStrip, Total } from "./plan-ui";

const usd = (dollars: number) => formatCurrencyCompact(Math.round(dollars * 100));
const clients = (n: number | null) => (n === null ? "—" : `${Math.ceil(n * 10) / 10} a week`);

export function SalonPlanner({ initial, cardPayment, taxHerProfit }: { initial: SalonPlan; cardPayment: number; taxHerProfit: number }) {
  const [s, setS] = useState(initial);
  const [taxProfit, setTaxProfit] = useState(taxHerProfit);
  const { state, send, schedule } = usePlanSaver();
  const m = salonMonth(s);

  const set = (patch: Partial<SalonPlan>) => {
    const next = { ...s, ...patch };
    setS(next);
    schedule("salon", () => send("/api/business/config", "PATCH", { salon: next }));
  };

  const useOnTax = async () => {
    const herProfit = Math.round(Math.max(0, m.annualProfit));
    if (await send("/api/household/config", "PATCH", { tax: { herProfit } })) setTaxProfit(herProfit);
  };

  return (
    <div className="space-y-10">
      <TotalsStrip cols={4}>
        <Total label="Takings a month" value={usd(m.gross)} note={`${s.clientsPerWeek} clients a week at ${usd(s.avgTicket)}`} />
        <Total label="Costs a month" value={usd(m.expenses)} note={`Booth rent ${usd(m.boothRent)} of it`} />
        <Total label="Profit a month" value={usd(m.profit)} tone={m.profit >= 0 ? "text-emerald-400" : "text-red-400"} note="Before tax" />
        <Total label="Hers to spend" value={usd(m.takeHome)} tone={m.takeHome >= 0 ? undefined : "text-red-400"}
          note={`After ${s.setAsidePct}% set aside for tax`} />
      </TotalsStrip>

      <section className="space-y-3">
        <SectionHead id="numbers" title="The chair" sub="What a week behind the chair brings in and costs. Change any box; it saves for both of you." />
        <Card>
          <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
            <NumberField id="ticket" label="Average ticket" step={5} value={s.avgTicket} onChange={(n) => set({ avgTicket: n })}
              hint="What a client pays on average, before tips." />
            <NumberField id="cpw" label="Clients a week" unit="#" value={s.clientsPerWeek} onChange={(n) => set({ clientsPerWeek: n })}
              hint="The plan's starting point is about $600 a week." />
            <NumberField id="weeks" label="Weeks worked a year" unit="#" value={s.weeksWorked} onChange={(n) => set({ weeksWorked: n })}
              hint="52 matches the plan. Lower it for holidays and sick days." />
            <NumberField id="booth" label="Booth rent, weekly" step={10} value={s.boothRentWeekly} onChange={(n) => set({ boothRentWeekly: n })}
              hint="Owed all 52 weeks, worked or not." />
            <NumberField id="soft" label="Software, monthly" value={s.software} onChange={(n) => set({ software: n })} hint="GlossGenius." />
            <NumberField id="supplies" label="Product and tools, monthly" step={10} value={s.supplies} onChange={(n) => set({ supplies: n })}
              hint="Not known yet. Her receipts will tell." />
            <NumberField id="proc" label="Card processing" unit="%" step={0.1} value={s.processingPct} onChange={(n) => set({ processingPct: n })}
              hint="Whatever GlossGenius takes on card payments." />
            <NumberField id="other" label="Anything else, monthly" step={10} value={s.other} onChange={(n) => set({ other: n })}
              hint="Classes, licence renewal, insurance." />
          </CardContent>
        </Card>
        <SaveIndicator state={state} />
      </section>

      <section className="space-y-3">
        <SectionHead id="month" title="A month of it" sub="Profit is what the IRS taxes. What's hers to spend is what's left after setting the tax aside." />
        <Card>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-1">
            <table className="w-full text-sm self-start">
              <tbody>
                <LedgerRow label="Takings" value={usd(m.gross)} />
                <LedgerRow dim label="Booth rent" value={`−${usd(m.boothRent)}`} />
                <LedgerRow dim label="Software, product and other" value={`−${usd(m.fixed - m.boothRent)}`} />
                {m.processing > 0 && <LedgerRow dim label="Card processing" value={`−${usd(m.processing)}`} />}
                <LedgerRow total label="Profit" value={usd(m.profit)} />
                <LedgerRow dim label={`Set aside for tax, ${s.setAsidePct}%`} value={`−${usd(m.setAside)}`} />
                <LedgerRow total label="Hers to spend" value={usd(m.takeHome)} />
                <LedgerRow dim label="Her card payment, from the budget" value={`−${usd(cardPayment)}`} />
                <LedgerRow total label="After the card" value={usd(m.takeHome - cardPayment)}
                  tone={m.takeHome - cardPayment < 0 ? "text-red-400" : undefined} />
              </tbody>
            </table>
            <div className="space-y-4">
              <CardTitle className="text-sm">What it takes</CardTitle>
              <table className="w-full text-sm">
                <tbody>
                  <LedgerRow label="Clients to cover booth rent and costs" value={clients(m.clientsToBreakEven)} />
                  <LedgerRow label={`Clients for ${usd(s.targetTakeHome)} a month to spend`} value={clients(m.clientsForTarget)} />
                  <LedgerRow label="Each $5 on the average ticket" value={`+${usd(m.plusFivePerTicket)}/mo`} />
                </tbody>
              </table>
              <NumberField id="target" label="Her target, to spend per month" step={100} className="max-w-[220px]"
                value={s.targetTakeHome} onChange={(n) => set({ targetTakeHome: n })}
                hint="Starts at the $2,520 the three futures test." />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHead id="tax" title="Her tax" sub="She's self-employed, so nothing is withheld. On a joint return it comes out of the household's refund unless it's paid along the way." />
        <Card>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-1">
            <table className="w-full text-sm self-start">
              <tbody>
                <LedgerRow label="Profit over a year (Schedule C)" value={usd(m.annualProfit)} />
                <LedgerRow label="Self-employment tax on it, 15.3% of 92.35%" value={usd(m.seTaxAnnual)} />
                <LedgerRow label="Set aside over a year" value={usd(m.setAside * 12)} />
                <LedgerRow total label="Per quarter, if paid as estimates" value={usd(m.quarterly)} />
              </tbody>
            </table>
            <div className="space-y-3 text-sm">
              <NumberField id="setAside" label="Set aside for tax" unit="%" className="max-w-[160px]"
                value={s.setAsidePct} onChange={(n) => set({ setAsidePct: n })}
                hint="About 14% is self-employment tax; the rest covers income tax at the household's bracket." />
              <p className="text-muted-foreground text-xs leading-relaxed">
                /tax is using <span className="font-mono">{usd(taxProfit)}</span> for her profit.
                {Math.round(Math.max(0, m.annualProfit)) !== taxProfit && " This page says otherwise."}
              </p>
              <Button size="sm" variant="outline" className={cn("h-8 text-xs")} onClick={useOnTax}
                disabled={Math.round(Math.max(0, m.annualProfit)) === taxProfit}>
                Use {usd(Math.max(0, m.annualProfit))} on /tax
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

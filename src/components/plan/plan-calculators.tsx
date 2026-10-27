"use client";

import { useState } from "react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { formatCurrencyCompact, formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { futures, cardPayoff, bonusAllocation, type HouseholdLine } from "@/lib/household/calc";
import type { HouseholdConfig } from "@/lib/household/config";
import { NumberField, usePlanSaver, SaveIndicator } from "./plan-inputs";
import { LedgerRow } from "./plan-ui";

const usd = (dollars: number) => formatCurrencyCompact(Math.round(dollars * 100));
const usd2 = (dollars: number) => formatCurrency(Math.round(dollars * 100));

type Section = "futures" | "card" | "bonus";

/** Config state for one or more sections, saved as it changes. */
function useSections(initial: HouseholdConfig) {
  const [config, setConfig] = useState(initial);
  const { state, send, schedule } = usePlanSaver();
  const set = <S extends Section>(section: S, patch: Partial<HouseholdConfig[S]>) => {
    const next = { ...config[section], ...patch };
    setConfig((c) => ({ ...c, [section]: next }));
    schedule(section, () => send("/api/household/config", "PATCH", { [section]: next }));
  };
  return { config, set, state };
}

// ============ APRIL'S CARD ============

export function CardPlanner({ lines, initialConfig }: { lines: HouseholdLine[]; initialConfig: HouseholdConfig }) {
  const { config, set, state } = useSections(initialConfig);
  const aprilCard = lines.find((l) => l.slug === "april_card");
  const payment = aprilCard ? aprilCard.amount / 100 : 0;
  const payoff = cardPayoff(config.card.balance, config.card.apr, payment, new Date());

  return (
    <Card>
      <CardContent className="flex flex-wrap gap-6 items-start pt-1">
        <NumberField id="ccBal" label="Balance today" step={50} className="w-36"
          value={config.card.balance} onChange={(n) => set("card", { balance: n })} />
        <NumberField id="ccApr" label="Interest rate" unit="%" step={0.5} className="w-36"
          value={config.card.apr} onChange={(n) => set("card", { apr: n })} />
        <table className="flex-1 min-w-[240px] text-sm">
          <tbody>
            <LedgerRow label="Monthly payment, from her line in the budget" value={usd(payment)} />
            <LedgerRow label="Months to clear it"
              value={payoff.kind === "ok" ? `${payoff.months} ${payoff.months === 1 ? "month" : "months"}` : payoff.kind === "never" ? "never" : "—"} />
            <LedgerRow label="Interest paid along the way"
              value={payoff.kind === "ok" ? usd(payoff.interest) : payoff.kind === "never" ? "grows" : "—"} />
            <LedgerRow total label="Paid off by"
              value={payoff.kind === "ok"
                ? payoff.paidOffBy.toLocaleDateString("en-US", { month: "long", year: "numeric" })
                : payoff.kind === "never" ? "payment is below the interest" : "—"} />
          </tbody>
        </table>
        <div className="w-full"><SaveIndicator state={state} /></div>
      </CardContent>
    </Card>
  );
}

// ============ THREE FUTURES ============

export function FuturesPlanner({ lines, initialConfig }: { lines: HouseholdLine[]; initialConfig: HouseholdConfig }) {
  const { config, set, state } = useSections(initialConfig);
  const cols = futures(lines, config.income, config.futures.aprilTakeHome);

  return (
    <Card>
      <CardContent className="space-y-4 pt-1">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <NumberField id="fApril" label="April's take-home in columns 2 and 3" step={100} className="max-w-[230px]"
            value={config.futures.aprilTakeHome} onChange={(n) => set("futures", { aprilTakeHome: n })}
            hint="Column 1 leaves her out deliberately. This box is what the other two columns test." />
          <SaveIndicator state={state} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 text-left font-semibold" />
                <th className="py-2 text-right font-semibold">1. AJ&apos;s income only</th>
                <th className="py-2 text-right font-semibold">2. Plus April&apos;s</th>
                <th className="py-2 text-right font-semibold">3. Plus April&apos;s, no Meridian</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              <FutureRow label="Money in" values={cols.map((c) => c.moneyIn)} />
              <FutureRow label="Every bill in the budget, tithe adjusted" values={cols.map((c) => c.out)} />
              <FutureRow label="Left over each month" values={cols.map((c) => c.left)} bold />
              <tr>
                <td className="py-2 font-sans">What it would take to close it</td>
                {cols.map((c, i) => (
                  <td key={i} className="py-2 text-right">{c.left >= 0 ? "nothing" : `${usd(-c.left)}/mo`}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function FutureRow({ label, values, bold }: { label: string; values: number[]; bold?: boolean }) {
  return (
    <tr className="border-b border-border">
      <td className={cn("py-2 font-sans", bold && "font-semibold")}>{label}</td>
      {values.map((v, i) => (
        <td key={i} className={cn("py-2 text-right", v < 0 && "text-red-400", bold && "font-semibold", bold && v > 0 && "text-emerald-400")}>
          {usd(v)}
        </td>
      ))}
    </tr>
  );
}

// ============ THE BONUS ============

export function BonusPlanner({ lines, initialConfig }: { lines: HouseholdLine[]; initialConfig: HouseholdConfig }) {
  const { config, set, state } = useSections(initialConfig);
  const ring = lines.find((l) => l.slug === "ring");
  const ringMonthly = ring ? ring.amount / 100 : 0;
  const bonus = bonusAllocation(lines, config.income, config.futures.aprilTakeHome, config.bonus);

  return (
    <Card>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-1">
        <div className="space-y-4">
          <CardTitle className="text-sm">What&apos;s actually left to allocate</CardTitle>
          <table className="w-full text-sm">
            <tbody>
              <LedgerRow label="Bonus, gross" value={usd2(bonus.gross)} />
              <LedgerRow dim label="Federal withholding at the 22% supplemental rate" value={`−${usd2(bonus.fed)}`} />
              <LedgerRow dim label="Social Security and Medicare" value={`−${usd2(bonus.fica)}`} />
              <LedgerRow total label="Landed in the account" value={usd2(bonus.net)} />
              <LedgerRow dim label="Tithe" value={`−${usd2(bonus.tithe)}`} />
              <LedgerRow total label="Free to allocate" value={usd2(bonus.free)} />
            </tbody>
          </table>
          <div className="flex flex-wrap gap-4">
            <NumberField id="bnAmt" label="Bonus, gross" step={100} className="w-36"
              value={config.bonus.gross} onChange={(n) => set("bonus", { gross: n })} />
            <NumberField id="bnTithePct" label="Tithe on it" unit="%" className="w-28"
              value={config.bonus.tithePct} onChange={(n) => set("bonus", { tithePct: n })} />
          </div>
          <SaveIndicator state={state} />
        </div>
        <div className="space-y-4">
          <CardTitle className="text-sm">Where it goes</CardTitle>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="mt-1" checked={config.bonus.ringBuyout}
              onChange={(e) => set("bonus", { ringBuyout: e.target.checked })} />
            <span>
              Buy out the ring — {usd2(config.bonus.ringBuyoutCost)}
              <span className="block text-[11px] text-muted-foreground">
                Removes {usd2(ringMonthly)} a month from the budget and narrows the gap below.
              </span>
            </span>
          </label>
          <NumberField id="bnOther" label="Anything else" step={100} className="max-w-[170px]"
            value={config.bonus.other} onChange={(n) => set("bonus", { other: Math.max(0, n) })}
            hint="Small debts, a deposit, whatever you decide together." />
          <table className="w-full text-sm">
            <tbody>
              <LedgerRow label="Left as cash" value={usd(bonus.left)} />
              <LedgerRow label="The monthly gap it has to cover" value={bonus.gap > 0 ? `${usd(bonus.gap)} / mo` : "none"} />
              <LedgerRow total label="Months of cover it buys"
                value={bonus.months === null ? "no gap to cover" : bonus.months < 0 ? "already overspent" : `${bonus.months.toFixed(1)} months`} />
            </tbody>
          </table>
          <p className={cn("text-xs", bonus.left < 0 ? "text-red-400" : bonus.months === null ? "text-emerald-400" : "text-muted-foreground")}>
            {bonus.left < 0
              ? "You've allocated more than the bonus actually left you."
              : bonus.months === null
                ? "With the bills covered, this is all reserve."
                : `Buying the ring out costs ${usd2(config.bonus.ringBuyoutCost)} now and narrows the gap by ${usd2(ringMonthly)} a month, so it ${config.bonus.ringBuyout ? "takes" : "would take"} cash away and hands some back. The months figure already accounts for both.`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

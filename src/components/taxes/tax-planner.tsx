"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/client/api";
import { formatCurrencyCompact } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { taxPlan2026, type TaxInputs } from "@/lib/household/calc";
import { NumberField, useDebouncedSaver } from "@/components/plan/plan-inputs";

const usd = (dollars: number) => formatCurrencyCompact(Math.round(dollars * 100));

type Props = {
  initialTax: TaxInputs;
  bonusGross: number;
  irsBalance: number;
  irsBalanceSource: "tracked" | "fallback";
  /** Static explainer rendered between the return and the W-4 table. */
  w4Explainer?: React.ReactNode;
  w4Caveats?: React.ReactNode;
};

export function TaxPlanner({ initialTax, bonusGross, irsBalance, irsBalanceSource, w4Explainer, w4Caveats }: Props) {
  const [tax, setTax] = useState(initialTax);
  const [error, setError] = useState(false);
  const schedule = useDebouncedSaver();

  const set = (patch: Partial<TaxInputs>) => {
    const next = { ...tax, ...patch };
    setTax(next);
    schedule("tax", async () => {
      const res = await apiFetch("/api/household/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tax: next }),
      }).catch(() => null);
      setError(!res?.ok);
    });
  };

  const plan = taxPlan2026(tax, bonusGross, irsBalance);
  const c = plan.comparison;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">What each choice costs, in dollars</CardTitle>
          <p className="text-xs text-muted-foreground">
            Federal income tax for 2026 only. Move April&apos;s number and watch the gap change. Saved for both of you.
            {error && <span className="text-red-400"> Couldn&apos;t save the last change.</span>}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <NumberField id="herGross" label="April's 2026 business profit" step={1000}
              value={tax.herProfit} onChange={(n) => set({ herProfit: n })} hint="Net for the year, before tax." />
            <NumberField id="gpYear" label="Meridian guaranteed payments, 2026" step={1875}
              value={tax.guaranteedPayments} onChange={(n) => set({ guaranteedPayments: n })}
              hint="$1,875 twice a month from January to the final draw on 27 October. About 20 payments." />
            <NumberField id="upeYear" label="Partnership costs deducted as UPE" step={500}
              value={tax.upe} onChange={(n) => set({ upe: n })}
              hint="Zero until the operating agreement is amended. The software runs about $466/mo, so $5,594 for the year." />
            <NumberField id="kids" label="Children under 17 on 31 Dec" unit="#"
              value={tax.kids} onChange={(n) => set({ kids: n })} hint="$2,200 each. Confirm ages and that each has an SSN." />
            <NumberField id="k1loss" label="His share of the partnership loss (K-1)" step={5000}
              value={tax.k1Loss} onChange={(n) => set({ k1Loss: n })}
              hint="His 35% share of the 2026 loss is about $43,578, but sweat equity creates no basis, so it may not be usable at all." />
            <NumberField id="giving" label="Cash giving with a record" step={500}
              value={tax.giving} onChange={(n) => set({ giving: n })}
              hint="Deductible up to $2,000 without itemising. Cash with no bank record or church statement counts as $0." />
            <NumberField id="llc" label="Harvard Extension tuition paid in 2026" step={500}
              value={tax.tuition} onChange={(n) => set({ tuition: n })}
              hint="Lifetime Learning Credit, 20% up to $10,000. Phases out between $160,000 and $180,000 of joint AGI. Needs the 1098-T." />
          </div>

          <div>
            <h3 className="text-sm font-semibold">Your 2026 return, line by line</h3>
            <p className="text-xs text-muted-foreground mb-2">
              Filing jointly, using the numbers above.{" "}
              {irsBalanceSource === "tracked"
                ? "The old IRS balance comes from the obligation tracked on this page."
                : "No IRS obligation is tracked on this page yet, so the old balance uses the plan's $12,533."}
            </p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[560px] text-sm">
                <tbody>
                  {plan.returnRows.map((r) => (
                    <tr key={r.label} className={cn("border-b border-border last:border-b-0", r.head && "bg-muted/40")}>
                      <td className={cn("px-3 py-1.5", r.head && "font-semibold")}>{r.label}</td>
                      <td className={cn(
                        "px-3 py-1.5 text-right font-mono tabular-nums whitespace-nowrap",
                        r.amount < 0 && "text-red-400",
                        r.head && "font-semibold",
                        r.head && r.amount > 0 && "text-emerald-400",
                      )}>
                        {usd(r.amount)}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.head ? "" : r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2">Filing jointly or separately</h3>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 text-left font-semibold">Federal tax, 2026</th>
                    <th className="px-3 py-2 text-right font-semibold">Filing jointly</th>
                    <th className="px-3 py-2 text-right font-semibold">Filing separately</th>
                  </tr>
                </thead>
                <tbody className="[&_td]:px-3 [&_td]:py-1.5 [&_td+td]:text-right [&_td+td]:font-mono [&_td+td]:tabular-nums [&_tr]:border-b [&_tr]:border-border">
                  <tr><td>Standard deduction</td><td>{usd(32200)}</td><td>{usd(16100)} each</td></tr>
                  <tr><td>Federal income tax on his income</td><td className="text-muted-foreground">— combined —</td><td>{usd(c.sepHisIncomeTax)}</td></tr>
                  <tr><td>Federal income tax on her income</td><td className="text-muted-foreground">— combined —</td><td>{usd(c.sepHerIncomeTax)}</td></tr>
                  <tr className="font-semibold"><td>Federal income tax, total</td><td>{usd(c.jointIncomeTax)}</td><td>{usd(c.sepIncomeTax)}</td></tr>
                  <tr><td>Self-employment tax — his Meridian guaranteed payment</td><td>{usd(c.hisSE)}</td><td>{usd(c.hisSE)}</td></tr>
                  <tr><td>Self-employment tax — her business</td><td>{usd(c.herSE)}</td><td>{usd(c.herSE)}</td></tr>
                  <tr className="font-semibold"><td>Total federal owed</td><td>{usd(c.jointOwed)}</td><td>{usd(c.sepOwed)}</td></tr>
                  <tr><td>Child tax credit claimed</td><td>{usd(c.ctc)}</td><td>{usd(c.ctc)}, one return only</td></tr>
                  <tr>
                    <td>Child and dependent care credit</td>
                    <td className={c.cdccAvailable > 0 ? "text-emerald-400" : "text-red-400"}>
                      {c.cdccAvailable > 0 ? `available — about ${usd(c.cdccAvailable)}` : "$0 — she has no earned income"}
                    </td>
                    <td className="text-red-400">not allowed</td>
                  </tr>
                  <tr><td>Texas community income split required</td><td className="text-emerald-400">no</td><td className="text-red-400">yes — Form 8958</td></tr>
                  <tr className="font-semibold">
                    <td>Cost of filing separately</td>
                    <td />
                    <td className={c.costOfSeparate > 0 ? "text-red-400" : "text-emerald-400"}>
                      {c.costOfSeparate > 0 ? "+" : ""}{usd(c.costOfSeparate)}
                    </td>
                  </tr>
                  <tr><td colSpan={3} className="!text-left !font-sans font-semibold pt-4">And then the refund</td></tr>
                  <tr><td>Withheld from his pay this year</td><td>{usd(c.withheld)}</td><td>{usd(c.withheld)}</td></tr>
                  <tr>
                    <td>Refund, before anything is taken</td>
                    <td className={c.refundJoint >= 0 ? "text-emerald-400" : "text-red-400"}>{usd(c.refundJoint)}</td>
                    <td className={c.refundSepHis >= 0 ? "text-emerald-400" : "text-red-400"}>{usd(c.refundSepHis)} his</td>
                  </tr>
                  <tr><td>Less his IRS installment balance</td><td className="text-red-400">{usd(-plan.irsBalance)}</td><td className="text-red-400">{usd(-plan.irsBalance)}</td></tr>
                  <tr className="font-semibold">
                    <td>Cash actually reaching you, after the old balance clears</td>
                    <td className={c.cashJoint >= 0 ? "text-emerald-400" : "text-red-400"}>{usd(c.cashJoint)}</td>
                    <td className={c.cashSep >= 0 ? "text-emerald-400" : "text-red-400"}>{usd(c.cashSep)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-2 max-w-prose">
              Filing separately also caps a dependent care FSA at $2,500 instead of the joint limit, halves the standard
              deduction for each of them, and halves the no-itemising cash giving deduction to $1,000 each. The separate
              column taxes each person on their own income; a real Texas separate return splits community income
              half-and-half on Form 8958, so treat it as the floor of what separate costs.
            </p>
          </div>
        </CardContent>
      </Card>

      {w4Explainer}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">The W-4, three ways</CardTitle>
          <p className="text-xs text-muted-foreground">
            Reads from the same boxes as the return above. The second and third columns are not predictions — they are
            what happens if the open items in the Meridian agreements go your way.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 text-left font-semibold">2026 federal</th>
                  {plan.scenarios.map((s) => (
                    <th key={s.label} className="px-3 py-2 text-right font-semibold">{s.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                <ScenarioRow label="Partnership costs as UPE" values={plan.scenarios.map((s) => s.upe)} plain />
                <ScenarioRow label="Partnership loss used" values={plan.scenarios.map((s) => s.loss)} plain />
                <ScenarioRow label="Total federal owed" values={plan.scenarios.map((s) => s.owed)} bold plain />
                <ScenarioRow label="Refund at the current W-4" values={plan.scenarios.map((s) => plan.withheld - s.owed)} />
                <ScenarioRow
                  label={`After the ${usd(plan.irsBalance)} IRS balance clears`}
                  values={plan.scenarios.map((s) => plan.withheld - s.owed - plan.irsBalance)}
                />
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plan.w4Options.map((o, i) => (
              <div key={o.label}
                className={cn("rounded-lg border border-border p-4 space-y-2", o.risky && "border-l-4 border-l-red-500")}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Option {"ABC"[i]}</p>
                <h4 className="text-sm font-semibold">{o.label}</h4>
                <table className="w-full text-sm">
                  <tbody>
                    <tr>
                      <td className="py-0.5 text-muted-foreground">Withheld for the year</td>
                      <td className="py-0.5 text-right font-mono tabular-nums">{usd(o.withheld)}</td>
                    </tr>
                    {o.outcomes.map((d, k) => (
                      <tr key={k}>
                        <td className="py-0.5 text-muted-foreground">{plan.scenarios[k].label.toLowerCase()}</td>
                        <td className={cn("py-0.5 text-right font-mono tabular-nums", d >= 0 ? "text-emerald-400" : "text-red-400")}>
                          {d >= 0 ? "refund " : "owes "}{usd(Math.abs(d))}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-border font-semibold">
                      <td className="pt-1.5">Freed per month now</td>
                      <td className={cn("pt-1.5 text-right font-mono tabular-nums", o.freedPerMonth > 0 && "text-emerald-400")}>
                        {o.freedPerMonth > 0 ? "+" : ""}{usd(o.freedPerMonth)}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p className="text-xs text-muted-foreground">
                  {o.risky
                    ? "Ends in a balance due under at least one column above, which is the specific thing that defaults an installment agreement."
                    : "Covers the bill under every column above, so no default risk from under-withholding."}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {w4Caveats}
    </div>
  );
}

function ScenarioRow({ label, values, bold, plain }: { label: string; values: number[]; bold?: boolean; plain?: boolean }) {
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className={cn("px-3 py-1.5 font-sans", bold && "font-semibold")}>{label}</td>
      {values.map((v, i) => (
        <td key={i} className={cn(
          "px-3 py-1.5 text-right",
          bold && "font-semibold",
          v < 0 && "text-red-400",
          !plain && v > 0 && "text-emerald-400",
        )}>
          {usd(v)}
        </td>
      ))}
    </tr>
  );
}

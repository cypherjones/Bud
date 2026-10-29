"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client/api";
import { formatCurrencyCompact } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { taxPlan2026, payPosition, type TaxInputs } from "@/lib/household/calc";
import type { TaxPicture } from "@/lib/actions/taxes";
import { NumberField, useDebouncedSaver } from "@/components/plan/plan-inputs";
import { SectionHead, TotalsStrip, Total, Aside, LedgerRow } from "@/components/plan/plan-ui";
import { YearEndChecklist } from "@/components/taxes/year-end-checklist";
import { FilingRules } from "@/components/taxes/filing-rules";
import { TaxFootnote } from "@/components/taxes/tax-footnote";

const usd = (dollars: number) => formatCurrencyCompact(Math.round(dollars * 100) + 0);
const day = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

type Props = {
  initialTax: TaxInputs;
  bonusGross: number;
  picture: TaxPicture;
  /** The IRS installment section, rendered on the server. */
  irsSection: React.ReactNode;
};

export function TaxWorkspace({ initialTax, bonusGross, picture, irsSection }: Props) {
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

  const { irs, draws, otherPay, today } = picture;
  const pay = payPosition(today, tax.checksPerYear);
  const plan = taxPlan2026(tax, bonusGross, irs.balance, pay);
  const c = plan.comparison;
  const missing = irs.months.filter((m) => m.status === "missing");
  const nextIrs = irs.months.find((m) => m.status === "due" || m.status === "upcoming");
  const gpGap = Math.round(tax.guaranteedPayments - draws.total);

  return (
    <>
      <TotalsStrip cols={4}>
        <Total
          label="Owed to the IRS"
          value={usd(irs.balance)}
          tone={missing.length > 0 ? "text-red-400" : undefined}
          note={
            <>
              {irs.tracked ? "Tracked" : "Estimated"}
              {irs.monthly ? `, ${usd(irs.monthly)} a month` : ""}.{" "}
              {missing.length > 0
                ? `${list(missing.map((m) => new Date(m.month + "-01T00:00:00").toLocaleDateString("en-US", { month: "long" })))} not seen.`
                : nextIrs
                  ? `Next about ${day(nextIrs.expected)}.`
                  : ""}
            </>
          }
        />
        <Total
          label="2026 federal estimate"
          value={usd(plan.total)}
          note={`Filing jointly, with ${usd(c.hisSE + c.herSE)} of self-employment tax`}
        />
        <Total
          label="Withheld so far"
          value={usd(plan.withheldYtd)}
          note={`${pay.checksPaid} of ${tax.checksPerYear} checks${plan.ytdEstimated ? " and the bonus, estimated" : ", from the stub"}. ${pay.checksLeft} to go.`}
        />
        <RefundTotal refund={plan.refund} offset={plan.offset} balance={irs.balance} />
      </TotalsStrip>

      {error && <p className="text-sm text-red-400">Couldn&apos;t save the last change. It will try again on the next one.</p>}

      {irsSection}

      <YearEndChecklist
        today={today}
        irsMonths={irs.months}
        irsMonthly={irs.monthly}
        upcomingPaydays={pay.upcoming}
        total={plan.total}
        withheld={plan.withheld}
        dueAtFiling={plan.dueAtFiling}
        hasOtherPayroll={otherPay.some((o) => /gusto/i.test(o.label))}
      />

      <section className="space-y-4">
        <SectionHead
          title="The 2026 return"
          sub="Filing jointly, from the numbers below. They save for both of you as you type."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField
            id="gpYear"
            label="Meridian guaranteed payments, 2026"
            step={1875}
            value={tax.guaranteedPayments}
            onChange={(n) => set({ guaranteedPayments: n })}
            hint={
              <>
                <span className={cn(gpGap !== 0 && "text-amber-400")}>
                  Seen in the bank: {usd(draws.total)}
                  {draws.count > 0 && (
                    <>
                      {" "}
                      ({draws.count} {draws.amount ? `draws of ${usd(draws.amount)}` : "draws"}, {day(draws.first!)} to {day(draws.last!)})
                    </>
                  )}
                  {gpGap > 0 ? `, ${usd(gpGap)} less than entered.` : gpGap < 0 ? `, ${usd(-gpGap)} more than entered.` : "."}
                </span>{" "}
                {gpGap !== 0 && (
                  <button
                    type="button"
                    onClick={() => set({ guaranteedPayments: draws.total })}
                    className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                  >
                    Use the bank&apos;s figure
                  </button>
                )}{" "}
                Meridian closed with the final draw on 27 October; its K-1 will state the real total.
              </>
            }
          />
          <NumberField
            id="herGross"
            label="April's 2026 business profit"
            step={1000}
            value={tax.herProfit}
            onChange={(n) => set({ herProfit: n })}
            hint="Net for the year, before tax. It is also her earned income for the childcare credit."
          />
          <NumberField
            id="kids"
            label="Children under 17 on 31 Dec"
            unit="#"
            value={tax.kids}
            onChange={(n) => set({ kids: n })}
            hint="$2,200 each. Confirm ages and that each has an SSN."
          />
          <NumberField
            id="upeYear"
            label="Partnership costs deducted as UPE"
            step={500}
            value={tax.upe}
            onChange={(n) => set({ upe: n })}
            hint="Only costs the operating agreement required him to bear. Zero unless it says so."
          />
          <NumberField
            id="k1loss"
            label="His share of the partnership loss (K-1)"
            step={5000}
            value={tax.k1Loss}
            onChange={(n) => set({ k1Loss: n })}
            hint={`His 35% share is about ${usd(tax.k1ShareIfUsable)}, but sweat equity creates no basis, so it may not be usable at all.`}
          />
          <NumberField
            id="giving"
            label="Cash giving with a record"
            step={500}
            value={tax.giving}
            onChange={(n) => set({ giving: n })}
            hint="Deductible up to $2,000 without itemising. Cash with no bank record or church statement counts as $0."
          />
          <NumberField
            id="llc"
            label="Harvard Extension tuition paid in 2026"
            step={500}
            value={tax.tuition}
            onChange={(n) => set({ tuition: n })}
            hint="Lifetime Learning Credit: 20% of up to $10,000, phasing out between $160,000 and $180,000 of joint AGI. Needs the 1098-T."
          />
          <NumberField
            id="whPerCheck"
            label="Federal withheld per check, now"
            step={10}
            value={tax.withholdingPerCheck}
            onChange={(n) => set({ withholdingPerCheck: n })}
            hint="From the latest Navusoft stub."
          />
          <NumberField
            id="whYtd"
            label="Federal withheld so far this year"
            step={100}
            value={tax.withheldYtd}
            onChange={(n) => set({ withheldYtd: n })}
            hint={
              tax.withheldYtd > 0
                ? "From the stub's year-to-date column."
                : `From the stub's year-to-date column. At 0, Bud estimates ${usd(plan.withheldYtd)}: ${pay.checksPaid} checks at the figure above plus 22% on the bonus.`
            }
          />
        </div>

        {otherPay.length > 0 && (
          <Aside tone="warn" title="Other 2026 pay in the bank that isn't in these numbers">
            {otherPay.map((o) => (
              <p key={o.label}>
                <b className="text-foreground">
                  {o.label}: {usd(o.total)}
                </b>{" "}
                ({o.count === 1 ? day(o.first) : `${o.count} deposits, ${day(o.first)} to ${day(o.last)}`}). {o.note}
              </p>
            ))}
          </Aside>
        )}

        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <table className="w-full text-sm">
            <tbody>
              {plan.returnRows.map((r) => (
                <LedgerRow
                  key={r.label}
                  total={r.head}
                  label={
                    <>
                      {r.label}
                      {r.note && <span className="block text-xs font-normal text-muted-foreground leading-snug">{r.note}</span>}
                    </>
                  }
                  value={usd(r.amount)}
                  tone={r.head && r.amount < 0 ? "text-red-400" : undefined}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHead
          title="Joint or separate"
          sub="The same income both ways. The separate column ignores the Texas community property split, so it's the least separate could cost."
        />
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <div className="grid grid-cols-[1fr_6rem_6rem] gap-x-3 border-b border-border pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span className="max-sm:hidden">Federal, 2026</span>
            <span className="sm:hidden" />
            <span className="text-right">Joint</span>
            <span className="text-right">Separate</span>
          </div>
          <CompareRow label="Standard deduction" joint={usd(32200)} sep={`${usd(16100)} each`} />
          <CompareRow label="Income tax, after credits" joint={usd(c.jointIncomeTax)} sep={usd(c.sepIncomeTax)} />
          <CompareRow label="Self-employment tax" joint={usd(c.hisSE + c.herSE)} sep={usd(c.hisSE + c.herSE)} />
          <CompareRow label="Total federal" joint={usd(c.jointOwed)} sep={usd(c.sepOwed)} bold />
          <CompareRow
            label="Childcare and education credits"
            joint={c.cdcc + c.llc > 0 ? usd(c.cdcc + c.llc) : "$0 now"}
            sep="not allowed"
            sepTone="text-red-400"
          />
          <CompareRow label="Child tax credit" joint={usd(c.ctc)} sep={`${usd(c.ctc)}, one return`} />
          <CompareRow label="Texas community income split" joint="no" sep="Form 8958" sepTone="text-red-400" />
          <CompareRow
            label="Refund before the IRS offset"
            joint={usd(c.refundJoint)}
            sep={`${usd(c.refundSepHis)} his`}
            jointTone={c.refundJoint < 0 ? "text-red-400" : undefined}
            sepTone={c.refundSepHis < 0 ? "text-red-400" : undefined}
          />
          <CompareRow label="Taken for his IRS balance" joint={usd(-(c.refundJoint > 0 ? Math.min(irs.balance, c.refundJoint) : 0))} sep={usd(-(c.refundSepHis > 0 ? Math.min(irs.balance, c.refundSepHis) : 0))} />
          <CompareRow label="Cash reaching the house" joint={usd(c.cashJoint)} sep={usd(c.cashSep)} bold />
          <CompareRow label="IRS balance left after" joint={usd(c.leftOnBalanceJoint)} sep={usd(c.leftOnBalanceSep)} />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-t border-border pt-2 mt-1 font-semibold">
            <span>Filing separately costs</span>
            <span className={cn("font-mono tabular-nums", c.costOfSeparate > 0 ? "text-red-400" : "text-emerald-400")}>
              {c.costOfSeparate > 0 ? "+" : ""}
              {usd(c.costOfSeparate)}
            </span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-prose">
          Filing separately also caps a dependent care FSA at $2,500 instead of the joint limit, halves the standard deduction and the
          no-itemising giving deduction, and rules out both the childcare and education credits. A real Texas separate return splits
          community income half-and-half on Form 8958. On a joint return, Form 8379 asks the IRS to pay April her share of the refund
          instead of applying it to his balance.
        </p>
      </section>

      <W4Section tax={tax} plan={plan} pay={pay} irsBalance={irs.balance} />

      <section className="space-y-3">
        <SectionHead title="The rules" sub="The law behind each number above, with links. Closed until you need it." />
        <details className="group rounded-xl border border-border bg-card">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold">
            The rules, with the law behind each one
          </summary>
          <div className="space-y-6 border-t border-border px-4 py-4">
            <FilingRules
              agi={plan.agi}
              herEarned={plan.herEarned}
              cdcc={plan.cdcc}
              cdccRate={plan.cdccRate}
              llc={plan.llc}
              tuition={tax.tuition}
            />
            <TaxFootnote />
          </div>
        </details>
      </section>
    </>
  );
}

function RefundTotal({ refund, offset, balance }: { refund: number; offset: number; balance: number }) {
  if (refund < 0)
    return (
      <Total
        label="Owed at filing"
        value={usd(-refund)}
        tone="text-red-400"
        note="On top of the installment. Must be paid by April to keep the agreement."
      />
    );
  if (refund > balance)
    return (
      <Total
        label="Refund after the offset"
        value={usd(refund - offset)}
        tone="text-emerald-400"
        note={`The ${usd(refund)} refund clears the ${usd(balance)} IRS balance first`}
      />
    );
  return (
    <Total
      label="Refund after the offset"
      value="$0"
      note={`All ${usd(refund)} goes to the IRS balance, leaving about ${usd(balance - offset)}`}
    />
  );
}

function CompareRow({
  label,
  joint,
  sep,
  bold,
  jointTone,
  sepTone,
}: {
  label: string;
  joint: string;
  sep: string;
  bold?: boolean;
  jointTone?: string;
  sepTone?: string;
}) {
  return (
    <div className={cn("grid grid-cols-[1fr_6rem_6rem] gap-x-3 py-1.5 border-b border-border last:border-b-0", bold && "font-semibold")}>
      <span className="max-sm:col-span-3 max-sm:pb-0.5">{label}</span>
      <span className="sm:hidden" />
      <span className={cn("text-right font-mono tabular-nums text-[13px]", jointTone)}>{joint}</span>
      <span className={cn("text-right font-mono tabular-nums text-[13px]", sepTone)}>{sep}</span>
    </div>
  );
}

type Plan = ReturnType<typeof taxPlan2026>;

function W4Section({
  tax,
  plan,
  pay,
  irsBalance,
}: {
  tax: TaxInputs;
  plan: Plan;
  pay: ReturnType<typeof payPosition>;
  irsBalance: number;
}) {
  return (
    <section className="space-y-3">
      <SectionHead
        title="The W-4 for the rest of 2026"
        sub={
          pay.checksLeft > 0
            ? `${usd(plan.withheldYtd)} is already withheld and can't change. Only the ${pay.checksLeft} ${pay.checksLeft === 1 ? "check" : "checks"} left can: ${list(pay.upcoming.map(day))}.`
            : "No 2026 paychecks are left, so a W-4 change now only affects 2027."
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {plan.scenarios.map((s) => {
          const r = plan.withheld - s.owed;
          return (
            <div key={s.label} className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</p>
              <table className="mt-1 w-full text-sm">
                <tbody>
                  <LedgerRow label="UPE deducted" value={usd(s.upe)} dim />
                  <LedgerRow label="K-1 loss used" value={usd(s.loss)} dim />
                  <LedgerRow label="Federal owed" value={usd(s.owed)} />
                  <LedgerRow
                    label={r >= 0 ? "Refund at today's W-4" : "Owed at today's W-4"}
                    value={usd(Math.abs(r))}
                    tone={r >= 0 ? "text-emerald-400" : "text-red-400"}
                  />
                  <LedgerRow label="Left of the IRS balance" value={usd(irsBalance - Math.min(irsBalance, Math.max(0, r)))} total />
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed max-w-prose">
        The second and third columns are not predictions. They are the return if Meridian&apos;s agreement covered his costs (UPE of{" "}
        {usd(tax.upeIfAmended)}) and if his share of the loss turned out usable. Both are questions for your CPA, and both have the
        1065&apos;s deadline.
      </p>

      {pay.checksLeft > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {plan.w4Options.map((o) => (
            <div
              key={o.perCheck}
              className={cn("rounded-xl border border-border bg-card px-4 py-3 space-y-2", o.risky && "border-l-4 border-l-red-500")}
            >
              <div>
                <p className="font-semibold leading-snug">{o.label}</p>
                <p className="text-xs text-muted-foreground leading-snug">{o.why}</p>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  <LedgerRow label="Withheld for 2026" value={usd(o.withheld)} />
                  {o.outcomes.map((d, k) => (
                    <LedgerRow
                      key={k}
                      dim
                      label={plan.scenarios[k].label}
                      value={`${d >= 0 ? "refund" : "owes"} ${usd(Math.abs(d))}`}
                      tone={d >= 0 ? "text-emerald-400" : "text-red-400"}
                    />
                  ))}
                  <LedgerRow
                    total
                    label="More in each check"
                    value={`${o.freedPerCheck > 0 ? "+" : ""}${usd(o.freedPerCheck)}`}
                    tone={o.freedPerCheck > 0 ? "text-emerald-400" : undefined}
                  />
                  <LedgerRow label="Over the checks left" value={usd(o.freedTotal)} dim />
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {o.freedPerCheck === 0
                  ? "Nothing changes."
                  : `About ${usd(o.freedPerMonth)} a month, but only until 31 December. The refund shrinks by the same ${usd(o.freedTotal)}, so that much less comes off the IRS balance in the spring.`}{" "}
                {o.risky ? "Ends in a balance due under at least one column, which is the specific thing that defaults an installment agreement." : ""}
              </p>
            </div>
          ))}
        </div>
      )}

      <Aside title="For 2027">
        <p>
          Meridian is closed, so there are no guaranteed payments to cover next year and no self-employment tax of his to withhold for.
          The form&apos;s starting point: Step 1(c) married filing jointly; Step 2(c) unchecked, because April is self-employed rather
          than on a second W-2; Step 3 at $6,600 for three children; work state Texas. If April&apos;s salon has a profit, cover its
          self-employment tax with extra withholding in Step 4(c) or quarterly estimates.
        </p>
        <p>
          While the installment agreement runs, each new year&apos;s tax must be filed and paid on time, and owing at filing without
          paying is a default. Refunds are applied to the balance in addition to the monthly payment, not instead of it.
        </p>
      </Aside>
    </section>
  );
}

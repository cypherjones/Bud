"use client";

import { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client/api";
import { formatCurrencyCompact, formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { Plus, X } from "lucide-react";
import {
  budgetTotals,
  futures,
  cardPayoff,
  bonusAllocation,
  lineAmount,
  type HouseholdLine,
  type LineOwner,
} from "@/lib/household/calc";
import type { HouseholdConfig } from "@/lib/household/config";
import { NumberField, OwnerToggle, OWNER_TEXT, useDebouncedSaver } from "./plan-inputs";

type Section = "income" | "futures" | "card" | "bonus";

const usd = (dollars: number) => formatCurrencyCompact(Math.round(dollars * 100));
const usd2 = (dollars: number) => formatCurrency(Math.round(dollars * 100));

type Props = {
  initialLines: HouseholdLine[];
  initialConfig: HouseholdConfig;
  budgetNotes?: React.ReactNode;
  futuresNotes?: React.ReactNode;
  bonusOptions?: React.ReactNode;
};

export function HouseholdPlan({ initialLines, initialConfig, budgetNotes, futuresNotes, bonusOptions }: Props) {
  const [lines, setLines] = useState(initialLines);
  const [config, setConfig] = useState(initialConfig);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const inFlight = useRef(0);
  const schedule = useDebouncedSaver();

  const send = async (url: string, method: string, body: unknown) => {
    inFlight.current++;
    setSaveState("saving");
    try {
      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(String(res.status));
      inFlight.current--;
      if (inFlight.current === 0) setSaveState("idle");
      return res;
    } catch {
      inFlight.current--;
      setSaveState("error");
      return null;
    }
  };

  // Each save captures the value it computed; a newer edit to the same key
  // replaces the pending save, so the last value typed is the one sent.
  const setSection = <S extends Section>(section: S, patch: Partial<HouseholdConfig[S]>) => {
    const next = { ...config[section], ...patch };
    setConfig((c) => ({ ...c, [section]: next }));
    schedule(section, () => send("/api/household/config", "PATCH", { [section]: next }));
  };

  const setLine = (id: string, patch: Partial<Pick<HouseholdLine, "amount" | "owner">>) => {
    const line = lines.find((l) => l.id === id);
    if (!line) return;
    const next = { ...line, ...patch };
    setLines((ls) => ls.map((l) => (l.id === id ? next : l)));
    schedule(`line:${id}`, () => send("/api/household/lines", "PATCH", { id, amount: next.amount / 100, owner: next.owner }));
  };

  const removeLine = async (id: string) => {
    if (!confirm("Remove this line from the shared budget?")) return;
    setLines((ls) => ls.filter((l) => l.id !== id));
    await send("/api/household/lines", "DELETE", { id });
  };

  const addLine = async (input: { groupName: string; label: string; amount: number; owner: LineOwner }) => {
    const res = await send("/api/household/lines", "POST", input);
    if (!res) return;
    const { id } = (await res.json()) as { id: string };
    const sameGroup = lines.filter((l) => l.groupName === input.groupName);
    const sortOrder = sameGroup.length ? Math.max(...sameGroup.map((l) => l.sortOrder)) + 1 : 9000;
    const ts = new Date().toISOString();
    setLines((ls) => [
      ...ls,
      { id, slug: null, note: null, sortOrder, createdAt: ts, updatedAt: ts, ...input, amount: Math.round(input.amount * 100) },
    ]);
  };

  const { income } = config;
  const totals = budgetTotals(lines, income);
  const cols = futures(lines, income, config.futures.aprilTakeHome);
  const aprilCard = lines.find((l) => l.slug === "april_card");
  const ring = lines.find((l) => l.slug === "ring");
  const payoff = cardPayoff(
    config.card.balance,
    config.card.apr,
    aprilCard ? aprilCard.amount / 100 : 0,
    new Date(),
  );
  const bonus = bonusAllocation(lines, income, config.futures.aprilTakeHome, config.bonus);

  const groups = useMemo(() => {
    const sorted = [...lines].sort((a, b) => a.sortOrder - b.sortOrder);
    const map = new Map<string, HouseholdLine[]>();
    for (const l of sorted) {
      if (!map.has(l.groupName)) map.set(l.groupName, []);
      map.get(l.groupName)!.push(l);
    }
    return [...map.entries()];
  }, [lines]);

  return (
    <div className="space-y-10">
      <div className="flex justify-end -mb-8 h-4 text-xs">
        {saveState === "saving" && <span className="text-muted-foreground">Saving…</span>}
        {saveState === "error" && <span className="text-red-400">Couldn&apos;t save — check the connection and try again</span>}
      </div>

      {/* ============ INCOME ============ */}
      <section id="income" className="space-y-3 scroll-mt-4">
        <SectionHead title="What comes in" sub="Change any of these and the whole page follows. Saved for both of you." />
        <Card>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-1">
            <NumberField
              id="hisNet"
              label="His take-home, per month"
              step={25}
              value={income.hisNet}
              onChange={(n) => setSection("income", { hisNet: n })}
              hint="Navusoft, 2 checks of $3,187.45."
            />
            <NumberField
              id="herNet"
              label="Her take-home, per month"
              step={50}
              value={income.herNet}
              onChange={(n) => setSection("income", { herNet: n })}
              hint="About $600 a week gross, less $250 a week booth rent and $25 a month GlossGenius."
            />
            <NumberField
              id="draw"
              label="Meridian draw, per month"
              step={50}
              value={income.draw}
              onChange={(n) => setSection("income", { draw: n })}
              hint="Zero. Meridian is closed; the final draw was 27 October."
            />
            <NumberField
              id="boys"
              label="Simon and Frank"
              step={25}
              value={income.boys}
              onChange={(n) => setSection("income", { boys: n })}
              hint="A seventh of rent and a sixth of utilities each."
            />
            <NumberField
              id="tithePct"
              label="Tithe, percent"
              unit="%"
              value={income.tithePct}
              onChange={(n) => setSection("income", { tithePct: n })}
              hint="Calculated on everything to the left."
            />
          </CardContent>
        </Card>
      </section>

      {/* ============ BUDGET ============ */}
      <section id="budget" className="space-y-3 scroll-mt-4">
        <SectionHead
          title="The budget, built together"
          sub="Every line starts somewhere, and none of it is fixed. Change an amount, or move a line between his, hers and shared."
        />
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 text-left font-semibold">Line</th>
                  <th className="px-3 py-2 text-right font-semibold">Per month</th>
                  <th className="px-3 py-2 text-right font-semibold">Who carries it</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {groups.map(([group, groupLines]) => (
                  <GroupRows
                    key={group}
                    group={group}
                    lines={groupLines}
                    income={income}
                    onLine={setLine}
                    onRemove={removeLine}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <AddLineRow groups={groups.map(([g]) => g)} onAdd={addLine} />
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-px overflow-hidden rounded-xl border border-border bg-border">
          <Total label="Money in" value={usd(totals.moneyIn)}
            note={`His ${usd(income.hisNet)} · hers ${usd(income.herNet)} · boys ${usd(income.boys)}${income.draw ? ` · draw ${usd(income.draw)}` : ""}`} />
          <Total label="On him alone" value={usd(totals.his)} tone={OWNER_TEXT.his}
            note={totals.hisShareOfHisIncome !== null ? `${Math.round(totals.hisShareOfHisIncome * 100)}% of what he brings in` : "—"} />
          <Total label="On her alone" value={usd(totals.hers)} tone={OWNER_TEXT.hers}
            note={totals.hersShareOfHerIncome !== null ? `${Math.round(totals.hersShareOfHerIncome * 100)}% of what she brings in` : "No income entered for her"} />
          <Total label="Shared" value={usd(totals.both)} tone={OWNER_TEXT.both} note="Split however you decide" />
          <Total label="Left over" value={usd(totals.net)} tone={totals.net >= 0 ? "text-emerald-400" : "text-red-400"}
            note="All income, all bills" />
        </div>

        {budgetNotes}
      </section>

      {/* ============ APRIL'S CARD ============ */}
      <section id="card" className="space-y-3 scroll-mt-4">
        <SectionHead title="April's card" sub="Paid from salon revenue. Change either box and the payoff moves; the payment comes from her line in the budget." />
        <Card>
          <CardContent className="flex flex-wrap gap-6 items-start pt-1">
            <NumberField id="ccBal" label="Balance today" step={50} className="w-36"
              value={config.card.balance} onChange={(n) => setSection("card", { balance: n })} />
            <NumberField id="ccApr" label="Interest rate" unit="%" step={0.5} className="w-36"
              value={config.card.apr} onChange={(n) => setSection("card", { apr: n })} />
            <table className="flex-1 min-w-[240px] text-sm">
              <tbody>
                <LedgerRow label="Monthly payment, from the budget" value={usd(aprilCard ? aprilCard.amount / 100 : 0)} />
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
          </CardContent>
        </Card>
      </section>

      {/* ============ FUTURES ============ */}
      <section id="futures" className="space-y-3 scroll-mt-4">
        <SectionHead title="Three futures" sub="Same bills, three different income pictures. The tithe moves with the income in each column." />
        <Card>
          <CardContent className="space-y-4 pt-1">
            <NumberField id="fApril" label="April's take-home in columns 2 and 3" step={100} className="max-w-[230px]"
              value={config.futures.aprilTakeHome} onChange={(n) => setSection("futures", { aprilTakeHome: n })}
              hint="Column 1 leaves her out deliberately. This box is what the other two columns test." />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 text-left font-semibold" />
                    <th className="py-2 text-right font-semibold">1. His income only</th>
                    <th className="py-2 text-right font-semibold">2. Plus April&apos;s</th>
                    <th className="py-2 text-right font-semibold">3. Plus April&apos;s, no Meridian</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  <FutureRow label="Money in" values={cols.map((c) => c.moneyIn)} />
                  <FutureRow label="Every bill from the budget above, tithe adjusted" values={cols.map((c) => c.out)} />
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
        {futuresNotes}
      </section>

      {/* ============ BONUS ============ */}
      <section id="bonus" className="space-y-3 scroll-mt-4">
        <SectionHead title="The bonus" sub="It has already been tithed on and banked. This works out what it covers and what moving some of it would do." />
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
                  value={config.bonus.gross} onChange={(n) => setSection("bonus", { gross: n })} />
                <NumberField id="bnTithePct" label="Tithe on it" unit="%" className="w-28"
                  value={config.bonus.tithePct} onChange={(n) => setSection("bonus", { tithePct: n })} />
              </div>
            </div>
            <div className="space-y-4">
              <CardTitle className="text-sm">Where it goes</CardTitle>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="mt-1" checked={config.bonus.ringBuyout}
                  onChange={(e) => setSection("bonus", { ringBuyout: e.target.checked })} />
                <span>
                  Buy out the ring — {usd2(config.bonus.ringBuyoutCost)}
                  <span className="block text-[11px] text-muted-foreground">
                    Removes {usd2(ring ? ring.amount / 100 : 0)} a month from the budget and narrows the gap below.
                  </span>
                </span>
              </label>
              <NumberField id="bnOther" label="Anything else" step={100} className="max-w-[170px]"
                value={config.bonus.other} onChange={(n) => setSection("bonus", { other: Math.max(0, n) })}
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
                    : `Buying the ring out costs ${usd2(config.bonus.ringBuyoutCost)} now and narrows the gap by ${usd2(ring ? ring.amount / 100 : 0)} a month, so it ${config.bonus.ringBuyout ? "takes" : "would take"} cash away and hands some back. The months figure already accounts for both.`}
              </p>
            </div>
          </CardContent>
        </Card>
        {bonusOptions}
      </section>
    </div>
  );
}

function SectionHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border pb-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground flex-1 min-w-[240px]">{sub}</p>
    </div>
  );
}

function GroupRows({
  group,
  lines,
  income,
  onLine,
  onRemove,
}: {
  group: string;
  lines: HouseholdLine[];
  income: HouseholdConfig["income"];
  onLine: (id: string, patch: Partial<Pick<HouseholdLine, "amount" | "owner">>) => void;
  onRemove: (id: string) => void;
}) {
  const subtotal = lines.reduce((s, l) => s + lineAmount(l, income), 0);
  return (
    <>
      <tr className="bg-muted/40">
        <td className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</td>
        <td className="px-3 py-1.5 text-right text-[11px] font-mono tabular-nums text-muted-foreground">{usd(subtotal)}</td>
        <td colSpan={2} />
      </tr>
      {lines.map((l) => {
        const isTithe = l.slug === "tithe";
        return (
          <tr key={l.id} className="group border-b border-border last:border-b-0">
            <td className="px-3 py-1.5">
              <span className="text-[13px]">{l.label}</span>
              {l.note && <span className="block text-[11px] text-muted-foreground">{l.note}</span>}
            </td>
            <td className="px-3 py-1.5 w-32">
              {isTithe ? (
                <p className="text-right font-mono tabular-nums text-muted-foreground">{usd(lineAmount(l, income))}</p>
              ) : (
                <NumberField id={`a_${l.id}`} step={5} value={l.amount / 100}
                  onChange={(n) => onLine(l.id, { amount: Math.max(0, Math.round(n * 100)) })} />
              )}
            </td>
            <td className="px-3 py-1.5 text-right whitespace-nowrap">
              <OwnerToggle value={l.owner} onChange={(o) => onLine(l.id, { owner: o })} />
            </td>
            <td className="pr-2">
              {!l.slug && (
                <button type="button" onClick={() => onRemove(l.id)} aria-label={`Remove ${l.label}`}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-red-400">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

function AddLineRow({
  groups,
  onAdd,
}: {
  groups: string[];
  onAdd: (input: { groupName: string; label: string; amount: number; owner: LineOwner }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [groupName, setGroupName] = useState(groups[1] ?? groups[0] ?? "Other");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState(0);
  const [owner, setOwner] = useState<LineOwner>("both");

  if (!open) {
    return (
      <div className="border-t border-border px-3 py-2">
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(true)}>
          <Plus className="w-3 h-3 mr-1" /> Add a line
        </Button>
      </div>
    );
  }

  const submit = async () => {
    if (!label.trim()) return;
    await onAdd({ groupName, label: label.trim(), amount, owner });
    setLabel("");
    setAmount(0);
    setOpen(false);
  };

  return (
    <div className="border-t border-border p-3 flex flex-wrap items-end gap-2 bg-accent/20">
      <select value={groupName} onChange={(e) => setGroupName(e.target.value)}
        className="h-8 rounded-lg border border-border bg-background px-2 text-sm">
        {groups.filter((g) => g !== "Giving").map((g) => <option key={g} value={g}>{g}</option>)}
      </select>
      <Input placeholder="What is it?" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setOpen(false); }}
        className="flex-1 min-w-[160px] text-sm" />
      <NumberField id="new_amount" value={amount} onChange={setAmount} step={5} className="w-28" />
      <OwnerToggle value={owner} onChange={setOwner} />
      <Button size="sm" className="h-8 text-xs" onClick={submit} disabled={!label.trim()}>Add</Button>
      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
    </div>
  );
}

function Total({ label, value, note, tone }: { label: string; value: string; note: string; tone?: string }) {
  return (
    <div className="bg-card px-4 py-3 min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-xl font-semibold font-mono tabular-nums", tone)}>{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">{note}</p>
    </div>
  );
}

function LedgerRow({ label, value, total, dim }: { label: string; value: string; total?: boolean; dim?: boolean }) {
  return (
    <tr className={cn(total && "border-t border-border font-semibold", dim && "text-muted-foreground")}>
      <td className={cn("py-1 pr-3", total && "pt-2")}>{label}</td>
      <td className={cn("py-1 text-right font-mono tabular-nums whitespace-nowrap", total && "pt-2")}>{value}</td>
    </tr>
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

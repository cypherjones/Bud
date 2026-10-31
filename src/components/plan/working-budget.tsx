"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";
import { formatCurrencyCompact } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { budgetTotals, lineAmount, titheBase, titheOn, type HouseholdLine, type Income } from "@/lib/household/calc";
import {
  applyScenario,
  hasChanges,
  monthlyCashEffect,
  shiftProjection,
  EMPTY_SCENARIO,
  type DailyBalance,
  type Scenario,
} from "@/lib/household/scenario";
import { NumberField, usePlanSaver, SaveIndicator } from "./plan-inputs";
import { SectionHead, TotalsStrip, Total, Aside } from "./plan-ui";

const usd = (dollars: number) => formatCurrencyCompact(Math.round(dollars * 100));
const signedUsd = (dollars: number) => `${dollars >= 0 ? "+" : "−"}${usd(Math.abs(dollars))}`;
const day = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

type Category = { id: string; name: string; groupName: string | null };

type Props = {
  liveLines: HouseholdLine[];
  liveIncome: Income;
  initialScenario: Scenario;
  categories: Category[];
  projection: {
    monthName: string;
    monthStart: string;
    daysInMonth: number;
    daily: DailyBalance[];
    scheduledByCategory: Record<string, number>;
  };
};

const INCOME_FIELDS: { key: keyof Income; label: string; unit?: string; step?: number }[] = [
  { key: "hisNet", label: "AJ's take-home", step: 25 },
  { key: "herNet", label: "April's take-home", step: 25 },
  { key: "boys", label: "Simon and Frank", step: 25 },
  { key: "tithePct", label: "Tithe, percent", unit: "%" },
  { key: "savings", label: "Into savings", step: 25 },
];

export function WorkingBudget({ liveLines, liveIncome, initialScenario, categories, projection }: Props) {
  const [s, setS] = useState<Scenario>(initialScenario);
  const [onlyChanges, setOnlyChanges] = useState(false);
  const [applying, setApplying] = useState(false);
  const { state, send, schedule } = usePlanSaver();

  const update = (next: Scenario) => {
    setS(next);
    schedule("scenario", () => send("/api/household/working", "PUT", next));
  };

  const setLine = (id: string, patch: { amount?: number; cut?: boolean }) => {
    const line = liveLines.find((l) => l.id === id);
    const merged = { ...s.lines[id], ...patch };
    if (line && merged.amount === line.amount) delete merged.amount;
    if (!merged.cut) delete merged.cut;
    const lines = { ...s.lines };
    if (merged.amount === undefined && !merged.cut) delete lines[id];
    else lines[id] = merged;
    update({ ...s, lines });
  };

  const setIncome = (key: keyof Income, value: number) => {
    const income = { ...s.income };
    if (value === liveIncome[key]) delete income[key];
    else income[key] = Math.max(0, value);
    update({ ...s, income });
  };

  const working = useMemo(() => applyScenario(liveLines, liveIncome, s), [liveLines, liveIncome, s]);
  const live = budgetTotals(liveLines, liveIncome);
  const work = budgetTotals(working.lines, working.income);
  const diff = work.net - live.net;

  const effect = monthlyCashEffect({ lines: liveLines, income: liveIncome }, working, projection.scheduledByCategory);
  const planCash = shiftProjection(projection.daily, projection.monthStart, projection.daysInMonth, 0);
  const workCash = shiftProjection(projection.daily, projection.monthStart, projection.daysInMonth, effect);
  const changed = hasChanges(s);

  const groups = useMemo(() => {
    const map = new Map<string, HouseholdLine[]>();
    for (const l of [...liveLines].sort((a, b) => a.sortOrder - b.sortOrder)) {
      if (!map.has(l.groupName)) map.set(l.groupName, []);
      map.get(l.groupName)!.push(l);
    }
    return [...map.entries()];
  }, [liveLines]);

  // Every change, biggest effect on the month first.
  const changes = useMemo(() => {
    const rows: { label: string; detail: string; delta: number }[] = [];
    for (const l of liveLines) {
      const o = s.lines[l.id];
      if (!o) continue;
      const before = lineAmount(l, liveIncome);
      if (o.cut) rows.push({ label: l.label, detail: "cut", delta: before });
      else if (o.amount !== undefined) rows.push({ label: l.label, detail: `${usd(before)} to ${usd(o.amount / 100)}`, delta: before - o.amount / 100 });
    }
    for (const a of s.added) rows.push({ label: a.label, detail: "added", delta: -a.amount / 100 });
    for (const f of INCOME_FIELDS) {
      const v = s.income[f.key];
      if (v === undefined) continue;
      const fmt = (n: number) => (f.unit === "%" ? `${n}%` : usd(n));
      const base = titheBase(liveIncome);
      const delta =
        f.key === "savings" ? liveIncome.savings - v
        : f.key === "tithePct" ? titheOn(base, liveIncome.tithePct) - titheOn(base, v)
        : v - liveIncome[f.key];
      rows.push({ label: f.label, detail: `${fmt(liveIncome[f.key])} to ${fmt(v)}`, delta });
    }
    return rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [s, liveLines, liveIncome]);

  const reset = async () => {
    if (!confirm("Throw away every change in the working budget?")) return;
    setS(EMPTY_SCENARIO);
    await send("/api/household/working", "DELETE", {});
  };

  const apply = async () => {
    if (!confirm("Make the working budget the real budget? Cut lines go to $0, added lines join the budget, and income changes go to the plan.")) return;
    setApplying(true);
    const res = await send("/api/household/working", "POST", s);
    if (res) window.location.reload();
    else setApplying(false);
  };

  const m = projection.monthName;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3 -mt-4">
        <SaveIndicator state={state} />
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={reset} disabled={!changed || applying}>Start over</Button>
          <Button size="sm" className="h-8 text-xs" onClick={apply} disabled={!changed || applying}>
            {applying ? "Applying…" : "Apply to the budget"}
          </Button>
        </div>
      </div>

      <section className="space-y-3">
        <TotalsStrip cols={5}>
          <Total label="Left over, budget" value={usd(live.net)} tone={live.net >= 0 ? "text-emerald-400" : "text-red-400"} note="The real budget, each month" />
          <Total label="Left over, working" value={usd(work.net)} tone={work.net >= 0 ? "text-emerald-400" : "text-red-400"} note="With your changes" />
          <Total label="Difference" value={signedUsd(diff)} tone={diff > 0 ? "text-emerald-400" : diff < 0 ? "text-red-400" : undefined}
            note={changes.length ? `${changes.length} ${changes.length === 1 ? "change" : "changes"}` : "No changes yet"} />
          <Total label={`Lowest in ${m}`} value={formatCurrencyCompact(workCash.lowest.balanceCents)}
            tone={workCash.lowest.balanceCents < 0 ? "text-red-400" : undefined}
            note={`${day(workCash.lowest.date)} · budget ${formatCurrencyCompact(planCash.lowest.balanceCents)}`} />
          <Total label={`End of ${m}`} value={formatCurrencyCompact(workCash.end)}
            tone={workCash.end < 0 ? "text-red-400" : undefined}
            note={`Budget ${formatCurrencyCompact(planCash.end)}`} />
        </TotalsStrip>
        <Aside tone={workCash.firstNegative ? "warn" : planCash.firstNegative ? "good" : undefined}>
          <p>
            {workCash.firstNegative
              ? `With these changes cash still goes below zero on ${day(workCash.firstNegative)}${planCash.firstNegative && planCash.firstNegative !== workCash.firstNegative ? `, against ${day(planCash.firstNegative)} on the real budget` : ""}.`
              : planCash.firstNegative
                ? `These changes keep cash above zero through ${m}. The real budget goes below zero on ${day(planCash.firstNegative)}.`
                : `Cash stays above zero through ${m} either way.`}{" "}
            The {m} figures start from today&apos;s cash and the dated schedule, as on Next month. Changes are counted from {m} 1, spread evenly across the month.
          </p>
        </Aside>
      </section>

      {changes.length > 0 && (
        <section className="space-y-3">
          <SectionHead title="Your changes" sub="Biggest effect on the month first. Positive means more left over." />
          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <table className="w-full text-sm">
              <tbody>
                {changes.map((c, i) => (
                  <tr key={i} className="border-b border-border last:border-b-0">
                    <td className="py-1.5 pr-3">{c.label}<span className="ml-2 text-[11px] text-muted-foreground">{c.detail}</span></td>
                    <td className={cn("py-1.5 text-right font-mono tabular-nums whitespace-nowrap", c.delta > 0 ? "text-emerald-400" : c.delta < 0 ? "text-red-400" : "text-muted-foreground")}>
                      {signedUsd(c.delta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <SectionHead title="What comes in" sub="Try a different income picture. The tithe follows AJ's pay and the boys' share; April's comes off her takings on the salon page." />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 rounded-xl border border-border bg-card px-4 py-3">
          {INCOME_FIELDS.map((f) => {
            const v = working.income[f.key];
            const moved = s.income[f.key] !== undefined;
            return (
              <NumberField key={f.key} id={`w_${f.key}`} label={f.label} unit={f.unit} step={f.step ?? 1} value={v}
                onChange={(n) => setIncome(f.key, n)}
                hint={<span className={moved ? "text-amber-400" : undefined}>Budget: {f.unit === "%" ? `${liveIncome[f.key]}%` : usd(liveIncome[f.key])}</span>} />
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHead title="Every line" sub="Change an amount or cut a line. Cut lines stay listed so you can bring them back." />
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
            <span>{changed ? "Changed lines are marked in amber." : "Nothing changed yet."}</span>
            <button type="button" onClick={() => setOnlyChanges((v) => !v)} className="hover:text-foreground underline decoration-dotted underline-offset-2">
              {onlyChanges ? "Show every line" : "Only changed lines"}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 text-left font-semibold">Line</th>
                  <th className="hidden sm:table-cell px-3 py-2 text-right font-semibold">Budget</th>
                  <th className="px-3 py-2 text-right font-semibold">Working</th>
                  <th className="hidden sm:table-cell px-3 py-2 text-right font-semibold">Change</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {groups.map(([group, lines]) => {
                  const shown = onlyChanges ? lines.filter((l) => s.lines[l.id]) : lines;
                  if (shown.length === 0) return null;
                  const before = lines.reduce((t, l) => t + lineAmount(l, liveIncome), 0);
                  const after = working.lines.filter((l) => l.groupName === group).reduce((t, l) => t + lineAmount(l, working.income), 0);
                  return (
                    <GroupBlock key={group} group={group} before={before} after={after}>
                      {shown.map((l) => (
                        <LineRow key={l.id} line={l} liveIncome={liveIncome} workIncome={working.income} override={s.lines[l.id]} onChange={(p) => setLine(l.id, p)} />
                      ))}
                    </GroupBlock>
                  );
                })}
                {s.added.length > 0 && (
                  <GroupBlock group="What-ifs" before={0} after={s.added.reduce((t, a) => t + a.amount / 100, 0)}>
                    {s.added.map((a) => (
                      <tr key={a.id} className="border-b border-border last:border-b-0 bg-amber-500/5">
                        <td className="px-3 py-1.5">
                          <span className="text-[13px]">{a.label}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {a.groupName}{a.categoryId ? ` · ${categories.find((c) => c.id === a.categoryId)?.name ?? ""}` : ""}
                          </span>
                        </td>
                        <td className="hidden sm:table-cell px-3 py-1.5 text-right font-mono tabular-nums text-muted-foreground">—</td>
                        <td className="px-2 sm:px-3 py-1.5 w-[8.5rem] sm:w-36">
                          <NumberField id={`add_${a.id}`} step={5} value={a.amount / 100}
                            onChange={(n) => update({ ...s, added: s.added.map((x) => (x.id === a.id ? { ...x, amount: Math.max(0, Math.round(n * 100)) } : x)) })} />
                        </td>
                        <td className="hidden sm:table-cell px-3 py-1.5 text-right font-mono tabular-nums text-red-400">{signedUsd(a.amount / 100)}</td>
                        <td className="pr-3 text-right">
                          <button type="button" aria-label={`Remove ${a.label}`} onClick={() => update({ ...s, added: s.added.filter((x) => x.id !== a.id) })}
                            className="text-muted-foreground hover:text-red-400">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </GroupBlock>
                )}
              </tbody>
            </table>
          </div>
          <AddWhatIf groups={groups.map(([g]) => g)} categories={categories}
            onAdd={(a) => update({ ...s, added: [...s.added, { ...a, id: Math.random().toString(36).slice(2, 10) }] })} />
        </div>
      </section>
    </div>
  );
}

function GroupBlock({ group, before, after, children }: { group: string; before: number; after: number; children: React.ReactNode }) {
  const d = after - before;
  return (
    <>
      <tr className="bg-muted/40 text-[11px] font-mono tabular-nums text-muted-foreground">
        <td className="px-3 py-1.5 font-sans font-semibold uppercase tracking-wide">{group}</td>
        <td className="hidden sm:table-cell px-3 py-1.5 text-right">{usd(before)}</td>
        <td className="px-3 py-1.5 text-right">{usd(after)}</td>
        <td className={cn("hidden sm:table-cell px-3 py-1.5 text-right", d < 0 ? "text-emerald-400" : d > 0 ? "text-red-400" : undefined)}>
          {Math.round(d) === 0 ? "" : signedUsd(d)}
        </td>
        <td />
      </tr>
      {children}
    </>
  );
}

function LineRow({
  line,
  liveIncome,
  workIncome,
  override,
  onChange,
}: {
  line: HouseholdLine;
  liveIncome: Income;
  workIncome: Income;
  override?: { amount?: number; cut?: boolean };
  onChange: (p: { amount?: number; cut?: boolean }) => void;
}) {
  const isTithe = line.slug === "tithe";
  const before = lineAmount(line, liveIncome);
  const cut = !!override?.cut;
  const after = cut ? 0 : isTithe ? lineAmount(line, workIncome) : (override?.amount ?? line.amount) / 100;
  const d = after - before;
  const touched = cut || override?.amount !== undefined;
  return (
    <tr className={cn("border-b border-border last:border-b-0", touched && "bg-amber-500/5")}>
      <td className="px-3 py-1.5">
        <span className={cn("text-[13px]", cut && "line-through text-muted-foreground")}>{line.label}</span>
        {line.note && <span className="block text-[11px] text-muted-foreground">{line.note}</span>}
        <span className="sm:hidden block text-[11px] text-muted-foreground">Budget {usd(before)}</span>
      </td>
      <td className="hidden sm:table-cell px-3 py-1.5 text-right font-mono tabular-nums text-muted-foreground">{usd(before)}</td>
      <td className="px-2 sm:px-3 py-1.5 w-[8.5rem] sm:w-36">
        {isTithe || cut ? (
          <p className={cn("text-right font-mono tabular-nums", cut ? "text-muted-foreground" : undefined)}>{usd(after)}</p>
        ) : (
          <NumberField id={`w_${line.id}`} step={5} value={after}
            onChange={(n) => onChange({ amount: Math.max(0, Math.round(n * 100)) })} />
        )}
      </td>
      <td className={cn("hidden sm:table-cell px-3 py-1.5 text-right font-mono tabular-nums text-xs", d < 0 ? "text-emerald-400" : d > 0 ? "text-red-400" : "text-muted-foreground")}>
        {Math.round(d) === 0 ? "" : signedUsd(d)}
      </td>
      <td className="pr-3 text-right whitespace-nowrap">
        {isTithe ? (
          <span className="text-[11px] text-muted-foreground">follows income</span>
        ) : (
          <button type="button" onClick={() => onChange({ cut: !cut })}
            className={cn("rounded-md border px-2 py-0.5 text-[11px] font-semibold",
              cut ? "border-amber-500/40 text-amber-400 hover:bg-amber-500/10" : "border-border text-muted-foreground hover:text-foreground")}>
            {cut ? "Restore" : "Cut"}
          </button>
        )}
      </td>
    </tr>
  );
}

function AddWhatIf({
  groups,
  categories,
  onAdd,
}: {
  groups: string[];
  categories: Category[];
  onAdd: (a: { groupName: string; label: string; amount: number; owner: "his" | "hers" | "both"; categoryId: string | null }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [groupName, setGroupName] = useState(groups.find((g) => g !== "Giving") ?? "Other");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState(0);
  const [categoryId, setCategoryId] = useState("");

  if (!open) {
    return (
      <div className="border-t border-border px-3 py-2">
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(true)}>
          <Plus className="w-3 h-3 mr-1" /> Add a what-if
        </Button>
      </div>
    );
  }

  const submit = () => {
    if (!label.trim()) return;
    onAdd({ groupName, label: label.trim(), amount: Math.max(0, Math.round(amount * 100)), owner: "both", categoryId: categoryId || null });
    setLabel("");
    setAmount(0);
    setCategoryId("");
    setOpen(false);
  };

  return (
    <div className="border-t border-border p-3 flex flex-wrap items-end gap-2 bg-accent/20">
      <select value={groupName} onChange={(e) => setGroupName(e.target.value)} aria-label="Group"
        className="h-8 rounded-lg border border-border bg-background px-2 text-sm">
        {groups.filter((g) => g !== "Giving").map((g) => <option key={g} value={g}>{g}</option>)}
      </select>
      <Input placeholder="What is it?" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setOpen(false); }}
        className="flex-1 min-w-[160px] text-sm" />
      <NumberField id="whatif_amount" value={amount} onChange={setAmount} step={5} className="w-28" />
      <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category"
        className="h-8 max-w-[180px] rounded-lg border border-border bg-background px-2 text-sm">
        <option value="">Not tracked</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <Button size="sm" className="h-8 text-xs" onClick={submit} disabled={!label.trim()}>Add</Button>
      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
    </div>
  );
}


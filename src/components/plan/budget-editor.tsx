"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrencyCompact } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { Plus, X } from "lucide-react";
import { budgetTotals, lineAmount, type HouseholdLine, type LineOwner } from "@/lib/household/calc";
import { budgetNote } from "@/lib/household/export";
import type { HouseholdConfig } from "@/lib/household/config";
import { NumberField, OwnerToggle, OWNER_TEXT, usePlanSaver, SaveIndicator } from "./plan-inputs";
import { SectionHead, TotalsStrip, Total } from "./plan-ui";
import { NotesExport } from "./notes-export";

const usd = (dollars: number) => formatCurrencyCompact(Math.round(dollars * 100));

type Category = { id: string; name: string; groupName: string | null };

type Props = {
  initialLines: HouseholdLine[];
  initialIncome: HouseholdConfig["income"];
  savingsBalance: number | null; // dollars, from the savings accounts
  spendByCategory: Record<string, number>; // cents this month
  categories: Category[];
  monthLabel: string;
  notes?: React.ReactNode;
};

export function BudgetEditor({ initialLines, initialIncome, savingsBalance, spendByCategory, categories, monthLabel, notes }: Props) {
  const [lines, setLines] = useState(initialLines);
  const [income, setIncome] = useState(initialIncome);
  const [showTracking, setShowTracking] = useState(false);
  const { state, send, schedule } = usePlanSaver();

  const setIncomeField = (patch: Partial<HouseholdConfig["income"]>) => {
    const next = { ...income, ...patch };
    setIncome(next);
    schedule("income", () => send("/api/household/config", "PATCH", { income: next }));
  };

  const setLine = (id: string, patch: Partial<Pick<HouseholdLine, "amount" | "owner" | "categoryId">>) => {
    const line = lines.find((l) => l.id === id);
    if (!line) return;
    const next = { ...line, ...patch };
    setLines((ls) => ls.map((l) => (l.id === id ? next : l)));
    schedule(`line:${id}`, () =>
      send("/api/household/lines", "PATCH", { id, amount: next.amount / 100, owner: next.owner, categoryId: next.categoryId }),
    );
  };

  const removeLine = async (id: string) => {
    if (!confirm("Remove this line from the budget?")) return;
    setLines((ls) => ls.filter((l) => l.id !== id));
    await send("/api/household/lines", "DELETE", { id });
  };

  const addLine = async (input: { groupName: string; label: string; amount: number; owner: LineOwner; categoryId: string | null }) => {
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

  const totals = budgetTotals(lines, income);

  const groups = useMemo(() => {
    const map = new Map<string, HouseholdLine[]>();
    for (const l of [...lines].sort((a, b) => a.sortOrder - b.sortOrder)) {
      if (!map.has(l.groupName)) map.set(l.groupName, []);
      map.get(l.groupName)!.push(l);
    }
    return [...map.entries()];
  }, [lines]);

  // A line shows its own spending only when no other line tracks the same
  // category; shared categories roll up to the group header instead.
  const linesPerCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) if (l.categoryId) m.set(l.categoryId, (m.get(l.categoryId) ?? 0) + 1);
    return m;
  }, [lines]);

  const coverMonths = savingsBalance !== null && totals.net < 0 ? savingsBalance / -totals.net : null;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3 -mt-4">
        <SaveIndicator state={state} />
        <NotesExport build={() => budgetNote(lines, income, savingsBalance)} />
      </div>

      {/* ============ COMING IN + SAVINGS ============ */}
      <section className="space-y-3">
        <SectionHead id="income" title="What comes in, and what's saved" sub="Change any of these and the whole budget follows. Saved for both of you." />
        <Card>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-1">
            <NumberField id="hisNet" label="AJ's take-home, per month" step={25} value={income.hisNet}
              onChange={(n) => setIncomeField({ hisNet: n })} hint="Navusoft, 2 checks of $3,187.45." />
            <NumberField id="boys" label="Simon and Frank" step={25} value={income.boys}
              onChange={(n) => setIncomeField({ boys: n })} hint="A seventh of rent and a sixth of utilities each." />
            <NumberField id="tithePct" label="Tithe, percent" unit="%" value={income.tithePct}
              onChange={(n) => setIncomeField({ tithePct: n })} hint="Calculated on everything coming in." />
            <NumberField id="savings" label="Into savings, per month" step={25} value={income.savings}
              onChange={(n) => setIncomeField({ savings: Math.max(0, n) })} hint="Set aside before anything counts as left over." />
            <div className="flex flex-col gap-1 min-w-0">
              <p className="text-xs font-medium text-foreground/80">In savings now</p>
              <p className="h-8 flex items-center font-mono tabular-nums text-lg font-semibold">
                {savingsBalance === null ? "—" : usd(savingsBalance)}
              </p>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {coverMonths === null
                  ? "Capital One 360, Chime and Navy Federal savings."
                  : `Covers ${coverMonths.toFixed(1)} months of the gap below.`}
              </p>
            </div>
          </CardContent>
        </Card>
        <p className="text-[11px] text-muted-foreground">
          April&apos;s salon income is left out for now — her lines are paid from salon revenue. The salon has its own page.
        </p>
      </section>

      {/* ============ BUDGET ============ */}
      <section className="space-y-3">
        <SectionHead id="budget" title="The budget" sub="Every line starts somewhere, and none of it is fixed. Change an amount, or move a line between AJ, April and shared." />
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
            <span>Spent so far in {monthLabel}, from the accounts Bud tracks</span>
            <button type="button" onClick={() => setShowTracking((v) => !v)} className="hover:text-foreground underline decoration-dotted underline-offset-2">
              {showTracking ? "Hide categories" : "Edit categories"}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full sm:min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 text-left font-semibold">Line</th>
                  <th className="px-3 py-2 text-right font-semibold">Per month</th>
                  <th className="hidden sm:table-cell px-3 py-2 text-right font-semibold">Spent</th>
                  <th className="hidden sm:table-cell px-3 py-2 text-right font-semibold">Who carries it</th>
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
                    spend={spendByCategory}
                    linesPerCategory={linesPerCategory}
                    categories={categories}
                    showTracking={showTracking}
                    onLine={setLine}
                    onRemove={removeLine}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <AddLineRow groups={groups.map(([g]) => g)} categories={categories} onAdd={addLine} />
        </Card>

        <TotalsStrip cols={6}>
          <Total label="Money in" value={usd(totals.moneyIn)}
            note={`AJ ${usd(income.hisNet)} · Simon and Frank ${usd(income.boys)}${income.draw ? ` · draw ${usd(income.draw)}` : ""}${income.herNet ? ` · April ${usd(income.herNet)}` : ""}`} />
          <Total label="On AJ" value={usd(totals.his)} tone={OWNER_TEXT.his}
            note={totals.hisShareOfHisIncome !== null ? `${Math.round(totals.hisShareOfHisIncome * 100)}% of his take-home` : "—"} />
          <Total label="On April" value={usd(totals.hers)} tone={OWNER_TEXT.hers} note="Paid from salon revenue" />
          <Total label="Shared" value={usd(totals.both)} tone={OWNER_TEXT.both} note="Split however you decide" />
          <Total label="Into savings" value={usd(totals.savings)} note={totals.savings ? "Before anything is left over" : "Nothing set aside yet"} />
          <Total label="Left over" value={usd(totals.net)} tone={totals.net >= 0 ? "text-emerald-400" : "text-red-400"} note="After every bill and the savings" />
        </TotalsStrip>

        {notes}
      </section>
    </div>
  );
}

function GroupRows({
  group,
  lines,
  income,
  spend,
  linesPerCategory,
  categories,
  showTracking,
  onLine,
  onRemove,
}: {
  group: string;
  lines: HouseholdLine[];
  income: HouseholdConfig["income"];
  spend: Record<string, number>;
  linesPerCategory: Map<string, number>;
  categories: Category[];
  showTracking: boolean;
  onLine: (id: string, patch: Partial<Pick<HouseholdLine, "amount" | "owner" | "categoryId">>) => void;
  onRemove: (id: string) => void;
}) {
  const subtotal = lines.reduce((s, l) => s + lineAmount(l, income), 0);
  const groupCats = [...new Set(lines.map((l) => l.categoryId).filter((c): c is string => !!c))];
  const groupSpent = groupCats.reduce((s, c) => s + (spend[c] ?? 0), 0) / 100;
  return (
    <>
      <tr className="bg-muted/40">
        <td className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</td>
        <td className="px-3 py-1.5 text-right text-[11px] font-mono tabular-nums text-muted-foreground">{usd(subtotal)}</td>
        <td className={cn("hidden sm:table-cell px-3 py-1.5 text-right text-[11px] font-mono tabular-nums", groupSpent > subtotal ? "text-red-400" : "text-muted-foreground")}>
          {groupCats.length ? usd(groupSpent) : ""}
        </td>
        <td className="hidden sm:table-cell" />
        <td />
      </tr>
      {lines.map((l) => {
        const isTithe = l.slug === "tithe";
        const planned = lineAmount(l, income);
        const own = l.categoryId && linesPerCategory.get(l.categoryId) === 1 ? (spend[l.categoryId] ?? 0) / 100 : null;
        return (
          <tr key={l.id} className="group border-b border-border last:border-b-0">
            <td className="px-3 py-1.5">
              <span className="text-[13px]">{l.label}</span>
              {l.note && <span className="block text-[11px] text-muted-foreground">{l.note}</span>}
              {/* Phone: owner and spending sit under the label instead of in columns */}
              <div className="sm:hidden mt-1 flex items-center gap-2">
                <OwnerToggle value={l.owner} onChange={(o) => onLine(l.id, { owner: o })} />
                {own !== null && (
                  <span className={cn("text-[11px] font-mono tabular-nums", own > planned ? "text-red-400" : "text-muted-foreground")}>
                    {usd(own)} spent
                  </span>
                )}
              </div>
              {showTracking && (
                <select
                  value={l.categoryId ?? ""}
                  onChange={(e) => onLine(l.id, { categoryId: e.target.value || null })}
                  aria-label={`Category for ${l.label}`}
                  className="mt-1 h-7 max-w-full rounded-md border border-border bg-background px-1.5 text-[11px]"
                >
                  <option value="">Not tracked</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.groupName ? `${c.groupName} · ` : ""}{c.name}</option>
                  ))}
                </select>
              )}
            </td>
            <td className="px-2 sm:px-3 py-1.5 w-[8.5rem] sm:w-36 align-top sm:align-middle">
              {isTithe ? (
                <p className="text-right font-mono tabular-nums text-muted-foreground">{usd(planned)}</p>
              ) : (
                <NumberField id={`a_${l.id}`} step={5} value={l.amount / 100}
                  onChange={(n) => onLine(l.id, { amount: Math.max(0, Math.round(n * 100)) })} />
              )}
            </td>
            <td className={cn("hidden sm:table-cell px-3 py-1.5 w-20 text-right font-mono tabular-nums text-xs", own !== null && own > planned ? "text-red-400" : "text-muted-foreground")}>
              {own === null ? "" : usd(own)}
            </td>
            <td className="hidden sm:table-cell px-3 py-1.5 text-right whitespace-nowrap">
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
  categories,
  onAdd,
}: {
  groups: string[];
  categories: Category[];
  onAdd: (input: { groupName: string; label: string; amount: number; owner: LineOwner; categoryId: string | null }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [groupName, setGroupName] = useState(groups[1] ?? groups[0] ?? "Other");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState(0);
  const [owner, setOwner] = useState<LineOwner>("both");
  const [categoryId, setCategoryId] = useState("");

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
    await onAdd({ groupName, label: label.trim(), amount, owner, categoryId: categoryId || null });
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
      <NumberField id="new_amount" value={amount} onChange={setAmount} step={5} className="w-28" />
      <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category"
        className="h-8 max-w-[180px] rounded-lg border border-border bg-background px-2 text-sm">
        <option value="">Not tracked</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <OwnerToggle value={owner} onChange={setOwner} />
      <Button size="sm" className="h-8 text-xs" onClick={submit} disabled={!label.trim()}>Add</Button>
      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
    </div>
  );
}

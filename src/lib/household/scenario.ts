/**
 * The working budget — a scratch copy of the household plan for testing cuts
 * and what-ifs. Pure functions, safe in client components. A scenario is a
 * set of overrides on top of the live plan, so a line nobody touched keeps
 * following the real budget.
 */
import { lineAmount, totalIncome, type HouseholdLine, type Income, type LineOwner } from "./calc";

export type AddedLine = {
  id: string;
  groupName: string;
  label: string;
  amount: number; // cents
  owner: LineOwner;
  categoryId: string | null;
};

export type Scenario = {
  lines: Record<string, { amount?: number; cut?: boolean }>; // amount in cents
  added: AddedLine[];
  income: Partial<Income>;
};

export const EMPTY_SCENARIO: Scenario = { lines: {}, added: [], income: {} };

export const ADDED_PREFIX = "w:";

/** The budget as the scenario has it: cut lines gone, amounts overridden, what-ifs added. */
export function applyScenario(lines: HouseholdLine[], income: Income, s: Scenario): { lines: HouseholdLine[]; income: Income } {
  const out: HouseholdLine[] = [];
  for (const l of lines) {
    const o = s.lines[l.id];
    if (o?.cut) continue;
    out.push(o?.amount !== undefined && l.slug !== "tithe" ? { ...l, amount: o.amount } : l);
  }
  const maxSort = lines.reduce((m, l) => Math.max(m, l.sortOrder), 0);
  s.added.forEach((a, i) => {
    out.push({
      id: ADDED_PREFIX + a.id,
      slug: null,
      groupName: a.groupName,
      label: a.label,
      note: null,
      amount: a.amount,
      owner: a.owner,
      categoryId: a.categoryId,
      sortOrder: maxSort + 1 + i,
      createdAt: "",
      updatedAt: "",
    });
  });
  return { lines: out, income: { ...income, ...s.income } };
}

/** True when the scenario differs from the live plan anywhere. */
export function hasChanges(s: Scenario): boolean {
  return Object.values(s.lines).some((o) => o.cut || o.amount !== undefined) || s.added.length > 0 || Object.keys(s.income).length > 0;
}

/** Cents per category key; lines with no category stand alone. */
function byKey(lines: HouseholdLine[], income: Income): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lines) {
    const key = l.categoryId ?? `line:${l.id}`;
    m.set(key, (m.get(key) ?? 0) + Math.round(lineAmount(l, income) * 100));
  }
  return m;
}

/**
 * How much more cash a month ends with under the working budget than under
 * the plan, in cents. A category costs a month whichever is larger of what
 * the plan carries and what the schedule bills for it; a cut comes off that
 * total, first from the undated part and then from the dated bills, so a
 * cut always counts in full. Income changes count in full too.
 */
export function monthlyCashEffect(
  live: { lines: HouseholdLine[]; income: Income },
  working: { lines: HouseholdLine[]; income: Income },
  scheduledByCategory: Record<string, number>,
): number {
  const pl = byKey(live.lines, live.income);
  const pw = byKey(working.lines, working.income);
  let effect = 0;
  for (const key of new Set([...pl.keys(), ...pw.keys()])) {
    const before = pl.get(key) ?? 0;
    const after = pw.get(key) ?? 0;
    const sched = key.startsWith("line:") ? 0 : scheduledByCategory[key] ?? 0;
    const costBefore = Math.max(before, sched);
    const costAfter = after >= before ? Math.max(after, sched) : Math.max(after, sched - (before - after));
    effect += costBefore - costAfter;
  }
  effect += Math.round((totalIncome(working.income) - totalIncome(live.income)) * 100);
  return effect;
}

export type DailyBalance = { date: string; balanceCents: number };

/**
 * Next month's day-by-day cash with the working budget's effect taken in
 * evenly across the month, starting on its first day.
 */
export function shiftProjection(daily: DailyBalance[], monthStart: string, daysInMonth: number, effectCents: number) {
  let k = 0;
  const days = daily.map((d) => {
    if (d.date < monthStart) return d;
    k++;
    return { date: d.date, balanceCents: d.balanceCents + Math.round((effectCents * k) / daysInMonth) };
  });
  let lowest = days[0] ?? { date: monthStart, balanceCents: 0 };
  let firstNegative: string | null = null;
  for (const d of days) {
    if (d.balanceCents < lowest.balanceCents) lowest = d;
    if (d.balanceCents < 0 && !firstNegative) firstNegative = d.date;
  }
  return { lowest, firstNegative, end: days.at(-1)?.balanceCents ?? 0 };
}

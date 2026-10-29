import { db, schema } from "@/lib/db";
import { and, desc, gte, inArray } from "drizzle-orm";
import { getBalances, type AccountBalance } from "@/lib/actions/balances";
import { getGoalContributions, type GoalContribution, type LinkableTransaction } from "@/lib/actions/goals";
import { loadPlan } from "@/lib/household/load";
import { budgetTotals, lineAmount, type HouseholdLine, type Income } from "@/lib/household/calc";

/**
 * Everything the Savings page shows, measured against the household plan.
 * All money here is in CENTS; the plan's dollar figures are converted once.
 */

export type ActiveGoal = {
  id: string;
  name: string;
  notes: string | null;
  targetCents: number;
  /** The row's own target, when the page shows a computed one instead. */
  storedTargetCents: number | null;
  savedCents: number;
  /** "savings": the whole savings balance counts toward it (the one-month buffer). */
  savedFrom: "linked" | "savings";
  targetDate: string | null;
  monthsLeft: number | null;
  perMonthCents: number | null;
  pastDue: boolean;
  contributions: GoalContribution[];
};

export type OldGoal = { id: string; name: string; targetCents: number; savedCents: number; reason: string };

export type SavingsMove = {
  id: string;
  date: string;
  cents: number;
  direction: "in" | "out";
  accountName: string;
  description: string;
  linkedGoalName: string | null;
};

export type SavingsView = {
  today: string;
  accounts: AccountBalance[];
  /** Savings accounts left out of the totals (excluded, or the feed stopped). */
  notCounted: AccountBalance[];
  savingsCents: number;
  planSetAsideCents: number;
  planSpendCents: number;
  monthsCovered: number | null;
  goals: ActiveGoal[];
  oldGoals: OldGoal[];
  moves: SavingsMove[];
  movesSince: string;
  inCents: number;
  outCents: number;
  linkable: LinkableTransaction[];
};

const MOVES_DAYS = 90;
const MOVED_TO_TEXAS = "Aug 31, 2026";

const iso = (d: Date) => d.toLocaleDateString("en-CA");
const dollars = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

/** Whole months from today until the date, not counting a month that has already started. */
function monthsUntil(target: string, now: Date): number {
  const t = new Date(target + "T00:00:00");
  return (t.getFullYear() - now.getFullYear()) * 12 + (t.getMonth() - now.getMonth()) + (t.getDate() >= now.getDate() ? 0 : -1);
}

const isBuffer = (name: string) => /month ahead|buffer|emergency/i.test(name);

const STOP = new Set(["fund", "savings", "saving", "goal", "money", "account", "plan", "with", "from", "month", "ahead"]);
const words = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !STOP.has(w));

/** A plan line that pays for the same thing a goal was saving for (the ring is a monthly lease now). */
function matchingLine(goalName: string, lines: HouseholdLine[]): HouseholdLine | null {
  const g = new Set(words(goalName));
  if (g.size === 0) return null;
  return lines.find((l) => l.amount > 0 && words(l.label).some((w) => g.has(w))) ?? null;
}

/**
 * Why a goal no longer belongs on the list, or null if it's still live.
 * Nothing is deleted here — the page lists these under "Old goals" and the
 * user removes them.
 */
function obsoleteReason(name: string, targetCents: number, lines: HouseholdLine[], income: Income): string | null {
  if (isBuffer(name)) return null;
  if (/residency/i.test(name)) return `Texas residency came with the move on ${MOVED_TO_TEXAS}. It was a to-do list, not money to save.`;
  if (/houston|move fund|moving/i.test(name)) return `The move it saved for is done. You moved to Montgomery, TX on ${MOVED_TO_TEXAS}.`;
  if (targetCents <= 0) return "It has no amount to save toward.";
  const line = matchingLine(name, lines);
  if (line) return `The plan pays for this as a monthly line now: ${line.label}, ${dollars(Math.round(lineAmount(line, income) * 100))} a month.`;
  return null;
}

export function getSavingsView(now: Date = new Date()): SavingsView {
  const today = iso(now);
  const { config, lines } = loadPlan();
  const totals = budgetTotals(lines, config.income);
  const planSpendCents = Math.round(totals.out * 100);
  const planSetAsideCents = Math.round(totals.savings * 100);

  const balances = getBalances(now);
  const savingsAll = balances.filter((a) => a.kind === "savings");
  const accounts = savingsAll.filter((a) => a.counted && a.syncing).sort((a, b) => b.balanceCents - a.balanceCents);
  const notCounted = savingsAll.filter((a) => !(a.counted && a.syncing));
  const savingsCents = accounts.reduce((s, a) => s + a.balanceCents, 0);

  // Goals: one table only. The old financial_plans "move" rows are not savings goals.
  const rows = db.select().from(schema.savingsGoals).all();
  const oldGoals: OldGoal[] = [];
  const live: typeof rows = [];
  for (const g of rows) {
    const reason = obsoleteReason(g.name, g.targetAmount, lines, config.income);
    if (reason) oldGoals.push({ id: g.id, name: g.name, targetCents: g.targetAmount, savedCents: g.currentAmount, reason });
    else live.push(g);
  }

  // Money linked to other goals is already spoken for; the buffer gets the rest of the savings balance.
  const linkedElsewhere = live.filter((g) => !isBuffer(g.name)).reduce((s, g) => s + g.currentAmount, 0);

  const goals: ActiveGoal[] = live.map((g) => {
    const buffer = isBuffer(g.name);
    const targetCents = buffer ? planSpendCents : g.targetAmount;
    const savedCents = buffer ? Math.max(0, savingsCents - linkedElsewhere) : g.currentAmount;
    const remaining = Math.max(0, targetCents - savedCents);
    const monthsLeft = g.targetDate ? monthsUntil(g.targetDate, now) : null;
    const pastDue = !!g.targetDate && g.targetDate < today && remaining > 0;
    const perMonthCents = monthsLeft !== null && monthsLeft > 0 ? Math.ceil(remaining / monthsLeft) : null;
    return {
      id: g.id,
      name: g.name,
      notes: g.notes,
      targetCents,
      storedTargetCents: buffer && g.targetAmount !== targetCents ? g.targetAmount : null,
      savedCents,
      savedFrom: buffer ? "savings" : "linked",
      targetDate: g.targetDate,
      monthsLeft,
      perMonthCents: remaining === 0 ? 0 : perMonthCents,
      pastDue,
      contributions: getGoalContributions(g.id),
    };
  });
  goals.sort((a, b) => (a.targetDate ?? "9999").localeCompare(b.targetDate ?? "9999"));

  // Money in and out of the counted savings accounts.
  const since = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - MOVES_DAYS));
  const nameById = new Map(accounts.map((a) => [a.id, a.name]));
  const goalNames = new Map(rows.map((g) => [g.id, g.name]));
  const txns = accounts.length
    ? db
        .select()
        .from(schema.transactions)
        .where(and(inArray(schema.transactions.accountId, accounts.map((a) => a.id)), gte(schema.transactions.date, since)))
        .orderBy(desc(schema.transactions.date))
        .all()
    : [];
  const moves: SavingsMove[] = txns.map((t) => ({
    id: t.id,
    date: t.date,
    cents: t.amount,
    direction: t.type === "income" ? "in" : "out",
    accountName: nameById.get(t.accountId ?? "") ?? "Savings",
    description: t.merchant ?? t.description,
    linkedGoalName: t.linkedGoalId ? (goalNames.get(t.linkedGoalId) ?? null) : null,
  }));
  const inCents = moves.filter((m) => m.direction === "in").reduce((s, m) => s + m.cents, 0);
  const outCents = moves.filter((m) => m.direction === "out").reduce((s, m) => s + m.cents, 0);

  const linkable: LinkableTransaction[] = txns
    .filter((t) => t.type === "income" && !t.linkedGoalId)
    .map((t) => ({
      id: t.id,
      date: t.date,
      amount: t.amount,
      description: t.description,
      merchant: t.merchant,
      accountName: nameById.get(t.accountId ?? "") ?? null,
      accountSubtype: "savings",
    }));

  return {
    today,
    accounts,
    notCounted,
    savingsCents,
    planSetAsideCents,
    planSpendCents,
    monthsCovered: planSpendCents > 0 ? savingsCents / planSpendCents : null,
    goals,
    oldGoals,
    moves,
    movesSince: since,
    inCents,
    outCents,
    linkable,
  };
}

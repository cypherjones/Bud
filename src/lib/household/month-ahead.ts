import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getTotalBalance } from "@/lib/actions/dashboard";
import { occurrencesBetween } from "@/lib/actions/recurring";
import { lineAmount, type HouseholdLine, type Income } from "./calc";

export type AheadEvent = {
  date: string;
  label: string;
  cents: number; // signed: + coming in, − going out
  category: string | null;
  /** False when the row is a plan figure never yet seen in a synced account. */
  seen: boolean;
};

export type AheadDay = { date: string; events: AheadEvent[]; balanceCents: number };

export type SpreadRow = {
  category: string;
  labels: string[];
  plannedCents: number;
  scheduledCents: number;
  spreadCents: number;
};

export type MonthAhead = {
  monthStart: string;
  monthEnd: string;
  today: string;
  cashTodayCents: number;
  cashAtMonthStartCents: number; // going into the 1st, before its bills
  cashEndFirstDayCents: number; // after the 1st's bills and spending
  endCents: number;
  lowest: { date: string; cents: number };
  /** First day the combined balance goes below zero, if it does. */
  firstNegative: string | null;
  inCents: number; // scheduled money in, inside the month
  outScheduledCents: number; // scheduled bills, inside the month
  spreadCents: number; // plan spending with no date, inside the month
  dailySpreadCents: number;
  leadIn: AheadDay[]; // today → the day before the month starts
  daily: { date: string; balanceCents: number }[]; // every day, today → month end
  daysInMonth: number;
  scheduledByCategory: Record<string, number>; // cents billed per category next month
  days: AheadDay[]; // the month, days with something on them
  spread: SpreadRow[];
  planMoneyInCents: number;
  planOutCents: number; // budget lines, without savings
  planSavingsCents: number;
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * The month after this one, walked day by day from today's cash.
 *
 * Dated money comes from the recurring schedule. Plan spending that has no
 * date (groceries, fuel, allowances…) is reconciled per category: whatever the
 * plan carries beyond what the schedule already covers is spread evenly across
 * the days. That way a category is never counted twice, and nothing in the plan
 * is left out.
 */
export function monthAhead(lines: HouseholdLine[], income: Income, now: Date = new Date()): MonthAhead {
  const today = iso(now);
  const first = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  const monthStart = iso(first);
  const monthEnd = iso(last);
  const daysInMonth = last.getDate();

  const categories = db
    .select({ id: schema.categories.id, name: schema.categories.name, group: schema.categoryGroups.name })
    .from(schema.categories)
    .leftJoin(schema.categoryGroups, eq(schema.categories.groupId, schema.categoryGroups.id))
    .all();
  const catById = new Map(categories.map((c) => [c.id, c]));

  const rows = db
    .select({
      merchant: schema.recurringTransactions.merchant,
      amount: schema.recurringTransactions.amount,
      frequency: schema.recurringTransactions.frequency,
      nextDueDate: schema.recurringTransactions.nextDueDate,
      lastSeenDate: schema.recurringTransactions.lastSeenDate,
      categoryId: schema.recurringTransactions.categoryId,
    })
    .from(schema.recurringTransactions)
    .where(eq(schema.recurringTransactions.isActive, true))
    .all();

  // Every scheduled occurrence from today to the end of next month. Something
  // due today counts unless its charge has already posted (then today's
  // balance already carries it).
  const events: AheadEvent[] = [];
  const scheduledByCategory = new Map<string, number>();
  for (const r of rows) {
    if (!r.nextDueDate) continue;
    const cat = r.categoryId ? catById.get(r.categoryId) : undefined;
    if (cat?.group === "Internal") continue;
    const isIncome = cat?.group === "Income";
    for (const date of occurrencesBetween(r.nextDueDate, r.frequency, today, monthEnd)) {
      if (date === today && r.lastSeenDate && r.lastSeenDate >= today) continue;
      events.push({ date, label: r.merchant, cents: isIncome ? r.amount : -r.amount, category: cat?.name ?? null, seen: !!r.lastSeenDate });
      if (!isIncome && date >= monthStart && r.categoryId) {
        scheduledByCategory.set(r.categoryId, (scheduledByCategory.get(r.categoryId) ?? 0) + r.amount);
      }
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || b.cents - a.cents);

  // Plan spending with no date: per category, what the plan carries beyond the schedule.
  const planned = new Map<string, { cents: number; labels: string[] }>();
  for (const l of lines) {
    const key = l.categoryId ?? `line:${l.id}`;
    const entry = planned.get(key) ?? { cents: 0, labels: [] };
    entry.cents += Math.round(lineAmount(l, income) * 100);
    entry.labels.push(l.label);
    planned.set(key, entry);
  }
  const spread: SpreadRow[] = [];
  for (const [key, p] of planned) {
    const scheduled = key.startsWith("line:") ? 0 : scheduledByCategory.get(key) ?? 0;
    const rest = Math.max(0, p.cents - scheduled);
    if (rest <= 0) continue;
    const name = key.startsWith("line:") ? "No category" : catById.get(key)?.name ?? "Other";
    spread.push({ category: name, labels: p.labels, plannedCents: p.cents, scheduledCents: scheduled, spreadCents: rest });
  }
  spread.sort((a, b) => b.spreadCents - a.spreadCents);
  const spreadCents = spread.reduce((s, r) => s + r.spreadCents, 0);
  const dailySpreadCents = Math.round(spreadCents / daysInMonth);

  // Walk every day from today, applying events and the daily spread.
  const { totalBalance } = getTotalBalance();
  let balance = totalBalance;
  let cashAtMonthStart = totalBalance;
  let lowest = { date: today, cents: totalBalance };
  let firstNegative: string | null = null;
  let cashEndFirstDay = totalBalance;
  const leadIn: AheadDay[] = [];
  const daily: { date: string; balanceCents: number }[] = [];
  const days: AheadDay[] = [];
  let ei = 0;
  for (let d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); iso(d) <= monthEnd; d.setDate(d.getDate() + 1)) {
    const date = iso(d);
    if (date === monthStart) cashAtMonthStart = balance;
    const todays: AheadEvent[] = [];
    while (ei < events.length && events[ei].date === date) todays.push(events[ei++]);
    // Today's spending is already in the balance; only today's bills still apply.
    balance += todays.reduce((s, e) => s + e.cents, 0) - (date === today ? 0 : dailySpreadCents);
    if (balance < lowest.cents) lowest = { date, cents: balance };
    if (balance < 0 && !firstNegative) firstNegative = date;
    if (date === monthStart) cashEndFirstDay = balance;
    daily.push({ date, balanceCents: balance });
    if (todays.length > 0) (date < monthStart ? leadIn : days).push({ date, events: todays, balanceCents: balance });
  }

  const inMonth = events.filter((e) => e.date >= monthStart);
  const plannedOut = lines.reduce((s, l) => s + Math.round(lineAmount(l, income) * 100), 0);
  return {
    monthStart,
    monthEnd,
    today,
    cashTodayCents: totalBalance,
    cashAtMonthStartCents: cashAtMonthStart,
    cashEndFirstDayCents: cashEndFirstDay,
    endCents: balance,
    lowest,
    firstNegative,
    inCents: inMonth.filter((e) => e.cents > 0).reduce((s, e) => s + e.cents, 0),
    outScheduledCents: -inMonth.filter((e) => e.cents < 0).reduce((s, e) => s + e.cents, 0),
    spreadCents,
    dailySpreadCents,
    leadIn,
    days,
    daily,
    daysInMonth,
    scheduledByCategory: Object.fromEntries(scheduledByCategory),
    spread,
    planMoneyInCents: Math.round((income.hisNet + income.herNet + income.draw + income.boys) * 100),
    planOutCents: plannedOut,
    planSavingsCents: Math.round(Math.max(0, income.savings) * 100),
  };
}

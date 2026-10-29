import { db, schema } from "@/lib/db";
import { and, eq, gte, inArray, like } from "drizzle-orm";
import { today as todayIso } from "@/lib/utils/format";

/**
 * This cycle's debt payments: every monthly row on the schedule in the
 * Financial group (car loans, the ring lease, the IRS), checked against the
 * bank. One answer for Debts, Credit and the home page to "is it paid?".
 *
 * A loan's due date is its contract day (debts.due_day) when Bud tracks the
 * loan; otherwise the schedule's own date. The schedule's date is when the
 * money usually leaves, which for the car loans is a few days after the due
 * date — fine for cash flow, wrong for "is it late".
 */

export type CyclePayment = {
  scheduleId: string;
  name: string;
  amount: number;
  /** This cycle's due date: the latest one on or before today. */
  dueDate: string;
  /** The one after it. */
  nextDueDate: string;
  debtId: string | null;
  state: "paid" | "late" | "scheduled";
  paidOn: string | null;
  /** A one-time row on the schedule that covers this cycle. */
  scheduledOn: string | null;
  daysLate: number;
  /** Loans are reported late at 30 days past due. Null for non-loans. */
  reportsLateOn: string | null;
};

const lenderKey = (name: string) => name.replace(/\(.*?\)/g, "").replace(/[^a-z\s]/gi, " ").trim().split(/\s+/)[0].toLowerCase();

export function addDays(d: string, n: number): string {
  const x = new Date(d + "T00:00:00");
  x.setDate(x.getDate() + n);
  return x.toLocaleDateString("en-CA");
}

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00") - Date.parse(a + "T00:00:00")) / 86_400_000);

/** The latest `day` of a month on or before `today` (days past the month's end clamp to its last day). */
function lastOccurrence(day: number, today: string): string {
  const t = new Date(today + "T00:00:00");
  for (let back = 0; back < 2; back++) {
    const y = t.getFullYear();
    const m = t.getMonth() - back;
    const last = new Date(y, m + 1, 0).getDate();
    const d = new Date(y, m, Math.min(day, last));
    if (d <= t) return d.toLocaleDateString("en-CA");
  }
  return today;
}

function nextOccurrence(due: string, day: number): string {
  const d = new Date(due + "T00:00:00");
  const last = new Date(d.getFullYear(), d.getMonth() + 2, 0).getDate();
  return new Date(d.getFullYear(), d.getMonth() + 1, Math.min(day, last)).toLocaleDateString("en-CA");
}

export function getCyclePayments(today: string = todayIso()): CyclePayment[] {
  const financial = db
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .innerJoin(schema.categoryGroups, eq(schema.categories.groupId, schema.categoryGroups.id))
    .where(eq(schema.categoryGroups.name, "Financial"))
    .all()
    .map((c) => c.id);
  if (financial.length === 0) return [];

  const rows = db
    .select()
    .from(schema.recurringTransactions)
    .where(and(eq(schema.recurringTransactions.isActive, true), inArray(schema.recurringTransactions.categoryId, financial)))
    .all();
  const monthly = rows.filter((r) => r.frequency === "monthly" && r.nextDueDate);
  const oneTime = rows.filter((r) => r.frequency === "one_time" && r.nextDueDate && r.nextDueDate >= today);
  const debts = db.select().from(schema.debts).where(eq(schema.debts.status, "active")).all();

  const out: CyclePayment[] = [];
  const claimed = new Set<string>();

  const items = monthly
    .map((r) => {
      const key = lenderKey(r.merchant);
      const debt =
        debts.find((d) => lenderKey(d.creditorName) === key && Math.abs(d.minimumPayment - r.amount) <= r.amount * 0.1) ?? null;
      const day = debt?.dueDay ?? new Date(r.nextDueDate! + "T00:00:00").getDate();
      const dueDate = lastOccurrence(day, today);
      return { r, key, debt, day, dueDate };
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  for (const { r, key, debt, day, dueDate } of items) {
    // A payment up to ten days early counts for this cycle.
    const paid = db
      .select({ id: schema.transactions.id, date: schema.transactions.date, amount: schema.transactions.amount })
      .from(schema.transactions)
      .where(and(eq(schema.transactions.type, "expense"), gte(schema.transactions.date, addDays(dueDate, -10)), like(schema.transactions.merchant, `%${key}%`)))
      .all()
      .filter((t) => !claimed.has(t.id) && Math.abs(t.amount - r.amount) <= r.amount * 0.1 && t.date <= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (paid) claimed.add(paid.id);

    const scheduled = paid
      ? null
      : oneTime.find((o) => lenderKey(o.merchant) === key && Math.abs(o.amount - r.amount) <= r.amount * 0.1 && o.nextDueDate! < nextOccurrence(dueDate, day));
    const daysLate = paid ? 0 : Math.max(0, daysBetween(dueDate, today));

    out.push({
      scheduleId: r.id,
      name: r.merchant,
      amount: r.amount,
      dueDate,
      nextDueDate: nextOccurrence(dueDate, day),
      debtId: debt?.id ?? null,
      state: paid ? "paid" : scheduled ? "scheduled" : "late",
      paidOn: paid?.date ?? null,
      scheduledOn: scheduled?.nextDueDate ?? null,
      daysLate,
      reportsLateOn: debt ? addDays(dueDate, 30) : null,
    });
  }
  return out;
}

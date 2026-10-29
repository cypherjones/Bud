import { db, schema } from "@/lib/db";
import { and, desc, eq, gte, like, lte } from "drizzle-orm";

/**
 * Keep the recurring schedule honest. The rows are planning data (what should
 * hit, when); nothing else advances them, so without this the dates freeze
 * at whenever they were written and every forecast walks forward from a
 * stale month. Two passes, both idempotent:
 *
 *   1. next_due_date → the first occurrence on or after today.
 *   2. last_seen_date → the newest transaction that looks like this row
 *      (a word from the merchant label, amount within −20% / +25%).
 *
 * Runs after every bank sync and on the home page. Cheap: ~40 rows.
 */
export function rollRecurringForward(today: Date = new Date()): { advanced: number; seen: number } {
  const todayStr = toIso(today);
  // Rows due today stay on today; only dates strictly in the past move.
  const rows = db
    .select({
      id: schema.recurringTransactions.id,
      merchant: schema.recurringTransactions.merchant,
      amount: schema.recurringTransactions.amount,
      frequency: schema.recurringTransactions.frequency,
      nextDueDate: schema.recurringTransactions.nextDueDate,
      lastSeenDate: schema.recurringTransactions.lastSeenDate,
      groupName: schema.categoryGroups.name,
    })
    .from(schema.recurringTransactions)
    .leftJoin(schema.categories, eq(schema.recurringTransactions.categoryId, schema.categories.id))
    .leftJoin(schema.categoryGroups, eq(schema.categories.groupId, schema.categoryGroups.id))
    .where(eq(schema.recurringTransactions.isActive, true))
    .all();

  let advanced = 0;
  let seen = 0;
  for (const r of rows) {
    const patch: { nextDueDate?: string; lastSeenDate?: string } = {};

    if (r.nextDueDate && r.nextDueDate < todayStr) {
      const next = advance(r.nextDueDate, r.frequency, todayStr);
      if (next && next !== r.nextDueDate) {
        patch.nextDueDate = next;
        advanced++;
      }
    }

    const latest = latestMatch(r.merchant, r.amount, r.groupName === "Income" ? "income" : "expense", r.lastSeenDate, todayStr);
    if (latest && (!r.lastSeenDate || latest > r.lastSeenDate)) {
      patch.lastSeenDate = latest;
      seen++;
    }

    if (Object.keys(patch).length > 0) {
      db.update(schema.recurringTransactions).set(patch).where(eq(schema.recurringTransactions.id, r.id)).run();
    }
  }
  return { advanced, seen };
}

function advance(from: string, frequency: string, todayStr: string): string | null {
  const d = new Date(from + "T00:00:00");
  const anchorDay = d.getDate();
  for (let i = 0; i < 400 && toIso(d) < todayStr; i++) {
    switch (frequency) {
      case "weekly":
        d.setDate(d.getDate() + 7);
        break;
      case "biweekly":
        d.setDate(d.getDate() + 14);
        break;
      case "monthly": {
        // Step by calendar month, keeping the anchor day where the month allows it.
        d.setDate(1);
        d.setMonth(d.getMonth() + 1);
        const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        d.setDate(Math.min(anchorDay, last));
        break;
      }
      case "yearly":
        d.setFullYear(d.getFullYear() + 1);
        break;
      default:
        return null; // one_time and unknown cadences are left alone
    }
  }
  return toIso(d);
}

/** Newest transaction in the last 60 days (or since last seen) that looks like this row. */
function latestMatch(label: string, amount: number, type: "income" | "expense", lastSeen: string | null, todayStr: string): string | null {
  const floor = new Date(todayStr + "T00:00:00");
  floor.setDate(floor.getDate() - 60);
  const sinceStr = lastSeen && lastSeen > toIso(floor) ? lastSeen : toIso(floor);
  const lo = Math.round(amount * 0.8);
  const hi = Math.round(amount * 1.25);

  for (const words of searchTerms(label)) {
    const row = db
      .select({ date: schema.transactions.date })
      .from(schema.transactions)
      .where(and(
        eq(schema.transactions.type, type),
        eq(schema.transactions.status, "posted"),
        gte(schema.transactions.date, sinceStr),
        lte(schema.transactions.date, todayStr),
        gte(schema.transactions.amount, lo),
        lte(schema.transactions.amount, hi),
        ...words.map((w) => like(schema.transactions.merchant, `%${w}%`)),
      ))
      .orderBy(desc(schema.transactions.date))
      .limit(1)
      .get();
    if (row) return row.date;
  }
  return null;
}

const STOP = /^(and|the|share|rent|payroll|minimum|installment|weekly|monthly|fund|checking|savings)$/i;

/**
 * Candidate word sets, each ANDed against the merchant string, tried in order:
 * the parenthetical ("Stephanie Burger"), then each " — " segment of the label
 * ("Apple Card minimum" → Apple AND Card, so a bare App Store charge can't
 * stand in for the card payment). "&" is also tried as a space: AT&T → "AT T".
 */
function searchTerms(label: string): string[][] {
  const out: string[][] = [];
  const paren = label.match(/\(([^)]+)\)/)?.[1]?.trim();
  if (paren && !/^\d|^weekly$|^monthly$/i.test(paren)) out.push([paren]);
  for (const segment of label.replace(/\([^)]*\)/g, "").split(/\s+—\s+|\s+\/\s+/)) {
    const words = segment.split(/[^A-Za-z&'+]+/).filter((w) => w.length >= 4 && !STOP.test(w));
    if (words.length === 0) continue;
    out.push(words);
    if (words.some((w) => w.includes("&"))) out.push(words.map((w) => w.replace(/&/g, " ")));
  }
  return out;
}

/**
 * Every date a recurring row lands on between `from` and `to` (inclusive,
 * YYYY-MM-DD), stepping from its next_due_date. Monthly rows keep their
 * anchor day, clamped to short months.
 */
export function occurrencesBetween(nextDue: string, frequency: string, from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(nextDue + "T00:00:00");
  const anchorDay = d.getDate();
  for (let i = 0; i < 400; i++) {
    const iso = toIso(d);
    if (iso > to) break;
    if (iso >= from) out.push(iso);
    switch (frequency) {
      case "weekly":
        d.setDate(d.getDate() + 7);
        break;
      case "biweekly":
        d.setDate(d.getDate() + 14);
        break;
      case "monthly": {
        d.setDate(1);
        d.setMonth(d.getMonth() + 1);
        const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        d.setDate(Math.min(anchorDay, last));
        break;
      }
      case "yearly":
        d.setFullYear(d.getFullYear() + 1);
        break;
      default:
        return out; // one_time: only the first date
    }
  }
  return out;
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

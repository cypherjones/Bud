import { db, schema } from "@/lib/db";
import { and, desc, eq, like, or } from "drizzle-orm";
import { getCreditTriage, type CreditTriage, type CreditTriageItem } from "@/lib/actions/credit-triage";
import { today as todayIso } from "@/lib/utils/format";

/**
 * The credit page's picture: the last report Bud has (the April 27 Experian
 * pull), checked against what Bud has seen since. The report is a snapshot;
 * the debts table and the bank are live. Where they disagree, both show.
 */

type Debt = typeof schema.debts.$inferSelect;

export type Tradeline = {
  item: CreditTriageItem;
  debt: Debt | null;
  /** On the report. */
  reported: number;
  /** In Bud today, when the account is tracked. */
  now: number | null;
  /** Loans only: true when the balance has moved by payments Bud estimated. */
  estimated: boolean;
  lastPayment: { date: string; amount: number } | null;
  /** This cycle's payment, for a loan with a due day. */
  cycle: {
    dueDate: string;
    paid: boolean;
    /** A payment on the schedule for today or later this cycle. */
    scheduled: { date: string; amount: number } | null;
    daysPastDue: number;
    /** Lenders report a payment late once it's 30 days past due. */
    reportsLateOn: string;
  } | null;
  headline: string;
  tone: "good" | "warn" | "bad" | null;
};

export type ScorePoint = { date: string; score: number; bureau: string | null; source: string | null };

export type Action = { title: string; detail: string; cost?: number; tone?: "warn" | "bad" };

export type CreditPicture = {
  today: string;
  scores: ScorePoint[];
  latest: ScorePoint | null;
  monthsOld: number | null;
  tier: string | null;
  reportDate: string;
  cards: { balance: number; limit: number; reportedPct: number | null };
  loansNow: number;
  loanNames: string[];
  tradelines: Tradeline[];
  triage: CreditTriage;
  derogatory: { owed: number; count: number; firstFallOff: { date: string; creditor: string } | null };
  experianMonthly: number | null;
  actions: Action[];
};

const lenderKey = (name: string) => name.replace(/\(.*?\)/g, "").replace(/[^a-z\s]/gi, " ").trim().split(/\s+/)[0].toLowerCase();
const parenWord = (name: string) => (name.match(/\((\w+)/)?.[1] ?? "").toLowerCase();

function addDays(d: string, n: number): string {
  const x = new Date(d + "T00:00:00");
  x.setDate(x.getDate() + n);
  return x.toLocaleDateString("en-CA");
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00") - Date.parse(a + "T00:00:00")) / 86_400_000);
const short = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/** The report item for a debt: same lender, and when a lender has two, the same word in parentheses ("VW", "Primary"). */
function matchDebt(item: CreditTriageItem, debts: Debt[]): Debt | null {
  const same = debts.filter((d) => lenderKey(d.creditorName) === lenderKey(item.creditor));
  if (same.length <= 1) return same[0] ?? null;
  return same.find((d) => parenWord(d.creditorName) === parenWord(item.creditor)) ?? null;
}

/** The due date this cycle: the most recent `dueDay` on or before today. */
function currentDueDate(dueDay: number, today: string): string {
  const t = new Date(today + "T00:00:00");
  const d = new Date(t.getFullYear(), t.getMonth(), Math.min(dueDay, 28));
  if (d > t) d.setMonth(d.getMonth() - 1);
  return d.toLocaleDateString("en-CA");
}

function cycleFor(debt: Debt, lastPayment: Tradeline["lastPayment"], today: string): Tradeline["cycle"] {
  if (!debt.dueDay || debt.status !== "active" || debt.currentBalance <= 0) return null;
  const dueDate = currentDueDate(debt.dueDay, today);
  // A payment up to ten days early still counts for this cycle.
  const paid = !!lastPayment && lastPayment.date >= addDays(dueDate, -10);
  const key = lenderKey(debt.creditorName);
  const word = parenWord(debt.creditorName);
  const scheduled = paid
    ? null
    : db
        .select({ merchant: schema.recurringTransactions.merchant, date: schema.recurringTransactions.nextDueDate, amount: schema.recurringTransactions.amount })
        .from(schema.recurringTransactions)
        .where(and(eq(schema.recurringTransactions.isActive, true), like(schema.recurringTransactions.merchant, `%${key}%`)))
        .all()
        .flatMap((r) => (r.date ? [{ ...r, date: r.date }] : []))
        .filter((r) => r.date >= today && r.date < addDays(dueDate, 30))
        // A lender with two loans: the row whose amount is the debt's payment.
        .filter((r) => Math.abs(r.amount - debt.minimumPayment) <= debt.minimumPayment * 0.1 || (word && r.merchant.toLowerCase().includes(word)))
        .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
  return {
    dueDate,
    paid,
    scheduled: scheduled ? { date: scheduled.date, amount: scheduled.amount } : null,
    daysPastDue: paid ? 0 : Math.max(0, daysBetween(dueDate, today)),
    reportsLateOn: addDays(dueDate, 30),
  };
}

export function getCreditPicture(): CreditPicture {
  const today = todayIso();
  const triage = getCreditTriage();
  const debts = db.select().from(schema.debts).all();

  const scores: ScorePoint[] = db
    .select()
    .from(schema.creditScores)
    .orderBy(desc(schema.creditScores.date))
    .all()
    .map((s) => ({ date: s.date, score: s.score, bureau: s.bureau, source: s.source }));
  const latest = scores[0] ?? null;
  const monthsOld = latest ? Math.floor(daysBetween(latest.date, today) / 30.4) : null;
  const tier = latest
    ? latest.score >= 800 ? "Exceptional" : latest.score >= 740 ? "Very good" : latest.score >= 670 ? "Good" : latest.score >= 580 ? "Fair" : "Poor"
    : null;

  const all = [...triage.active, ...triage.chargeOffs, ...triage.collections, ...triage.authorizedUser];
  const reportDate = all.map((i) => i.lastReportedDate ?? "").sort().pop() || "2026-04-27";

  const tradelines: Tradeline[] = triage.active.map((item) => {
    const debt = matchDebt(item, debts);
    const pay = debt
      ? db
          .select({ date: schema.debtPayments.date, amount: schema.debtPayments.amount, notes: schema.debtPayments.notes })
          .from(schema.debtPayments)
          .where(eq(schema.debtPayments.debtId, debt.id))
          .orderBy(desc(schema.debtPayments.date))
          .all()
      : [];
    const lastPayment = pay[0] ? { date: pay[0].date, amount: pay[0].amount } : null;
    const estimated = pay.some((p) => p.notes?.startsWith("Seen in the bank"));
    const cycle = debt ? cycleFor(debt, lastPayment, today) : null;

    let headline: string;
    let tone: Tradeline["tone"] = null;
    if (!debt) {
      headline = "Not tracked in Bud, so nothing to check it against.";
    } else if (debt.status === "paid_off" || debt.currentBalance === 0) {
      headline = `Paid off${lastPayment ? ` ${short(lastPayment.date)}` : ""}. The report shows it after the next statement closes.`;
      tone = "good";
    } else if (!lastPayment || daysBetween(lastPayment.date, today) > 60) {
      headline = lastPayment
        ? `No payment since ${short(lastPayment.date)}.`
        : `No payment to ${debt.creditorName.replace(/\s*\(.*\)/, "")} in any synced account, and it isn't in the budget.`;
      tone = "bad";
    } else if (cycle && !cycle.paid) {
      headline = cycle.scheduled
        ? `${short(cycle.dueDate)} payment is ${cycle.daysPastDue} days late, scheduled ${cycle.scheduled.date === today ? "today" : short(cycle.scheduled.date)}. It reports late if not paid by ${short(cycle.reportsLateOn)}.`
        : `${short(cycle.dueDate)} payment not seen yet${cycle.daysPastDue > 0 ? `, ${cycle.daysPastDue} days late` : ""}. It reports late if not paid by ${short(cycle.reportsLateOn)}.`;
      tone = cycle.daysPastDue >= 20 ? "bad" : "warn";
    } else {
      headline = `Paid ${usd(lastPayment.amount)} on ${short(lastPayment.date)}.`;
      tone = "good";
    }

    return {
      item,
      debt,
      reported: item.balanceCents,
      now: debt ? debt.currentBalance : null,
      estimated,
      lastPayment,
      cycle,
      headline,
      tone,
    };
  });

  const ownCards = debts.filter((d) => d.type === "credit_card" && d.creditLimit);
  const cards = {
    balance: ownCards.reduce((s, d) => s + d.currentBalance, 0),
    limit: ownCards.reduce((s, d) => s + (d.creditLimit ?? 0), 0),
    reportedPct: (() => {
      const lines = tradelines.filter((t) => t.debt?.type === "credit_card" && t.debt.creditLimit);
      const lim = lines.reduce((s, t) => s + (t.debt!.creditLimit ?? 0), 0);
      return lim ? Math.round((lines.reduce((s, t) => s + t.reported, 0) / lim) * 100) : null;
    })(),
  };
  const loans = debts.filter((d) => d.status === "active" && d.type !== "credit_card" && d.currentBalance > 0);
  const loansNow = loans.reduce((s, d) => s + d.currentBalance, 0);

  const open = (i: CreditTriageItem) => i.status !== "settled" && i.status !== "removed";
  const derogs = [...triage.chargeOffs, ...triage.collections].filter(open);
  const firstFallOff = derogs
    .filter((d) => d.fallOffDate)
    .sort((a, b) => a.fallOffDate!.localeCompare(b.fallOffDate!))[0];

  const experian = db
    .select({ amount: schema.transactions.amount, date: schema.transactions.date })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.type, "expense"), or(like(schema.transactions.merchant, "%experian%"), like(schema.transactions.description, "%experian%"))))
    .orderBy(desc(schema.transactions.date))
    .get();
  const experianMonthly = experian && daysBetween(experian.date, today) <= 45 ? experian.amount : null;

  // What to do, most urgent first.
  const actions: Action[] = [];
  for (const t of tradelines) {
    if (t.cycle && !t.cycle.paid && t.debt) {
      actions.push({
        title: `${t.cycle.scheduled ? "Make sure" : "Pay"} ${t.debt.creditorName}'s ${short(t.cycle.dueDate)} payment ${t.cycle.scheduled ? "goes through" : ""} before ${short(t.cycle.reportsLateOn)}`.replace(/\s+/g, " "),
        detail: `It's ${t.cycle.daysPastDue} days past due. At 30 days the lender reports it late, and a new late mark costs more than anything else on this list can gain.`,
        cost: t.debt.minimumPayment,
        tone: "bad",
      });
    }
  }
  const pastDueOnReport = triage.active.filter((i) => /past due|late/i.test(i.notes ?? "") && /bridgecrest/i.test(i.creditor));
  if (pastDueOnReport.length > 0) {
    actions.push({
      title: "Check whether the car loans are still behind",
      detail:
        "In April both Bridgecrest loans had past-due amounts. Paying just the monthly amount keeps a loan the same number of payments behind, so it can keep reporting late every month. Bridgecrest's site shows the past-due amount; anything above this month's payment needs catching up.",
      tone: "warn",
    });
  }
  for (const t of tradelines.filter((t) => t.tone === "bad" && !t.cycle)) {
    actions.push({
      title: `Find out where ${t.item.creditor} stands`,
      detail: `${t.headline} On the April report it was ${usd(t.reported)}${t.item.notes ? `. ${t.item.notes}` : "."}`,
      tone: "bad",
    });
  }
  if (!latest || (monthsOld ?? 0) >= 2) {
    actions.push({
      title: "Log a current score",
      detail: `${latest ? `The last score here is ${monthsOld} months old` : "No score is logged"}${
        experianMonthly ? `, and you pay Experian ${usd(experianMonthly)} a month, which shows a fresh one` : ""
      }. Log it with "Log score" so this page can show a trend, and update the report items while you're there.`,
    });
  }
  const dupes = [...triage.chargeOffs, ...triage.collections].filter((i) => i.status === "dispute" && open(i));
  if (dupes.length > 0) {
    actions.push({
      title: `Dispute the duplicate${dupes.length > 1 ? "s" : ""}`,
      detail: `${dupes.map((d) => d.creditor).join(" and ")} report the same ${usd(dupes[0].balanceCents)} debt. Disputing with the bureau is free, and only one can stay.`,
      cost: 0,
    });
  }
  const small = derogs.filter((d) => d.status !== "dispute" && d.balanceCents <= 25_000).sort((a, b) => a.balanceCents - b.balanceCents);
  if (small.length > 0) {
    const total = small.reduce((s, d) => s + d.balanceCents, 0);
    actions.push({
      title: `Pay off the ${small.length} smallest for deletion`,
      detail: `${small.map((d) => `${d.creditor} ${usd(d.balanceCents)}`).join(", ")}. Ask each for deletion in writing before paying.`,
      cost: total,
    });
  }

  return {
    today,
    scores,
    latest,
    monthsOld,
    tier,
    reportDate,
    cards,
    loansNow,
    loanNames: loans.map((d) => d.creditorName),
    tradelines,
    triage,
    derogatory: {
      owed: triage.summary.totalDamage,
      count: derogs.length,
      firstFallOff: firstFallOff ? { date: firstFallOff.fallOffDate!, creditor: firstFallOff.creditor } : null,
    },
    experianMonthly,
    actions,
  };
}

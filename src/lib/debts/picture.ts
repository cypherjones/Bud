import { db, schema } from "@/lib/db";
import { desc, eq } from "drizzle-orm";
import { loadPlan } from "@/lib/household/load";
import { singleDebtPayoff, simulateDebtPayoff } from "@/lib/utils/debt-engine";
import { today as todayIso } from "@/lib/utils/format";
import { daysBetween, getCyclePayments, type CyclePayment } from "./payments";

/**
 * Everything owed, from two places: loans Bud tracks (debts table, balances
 * moved by payments seen in the bank) and debt lines in the household plan
 * that aren't tracked loans (the IRS, April's card, the ring lease). The plan
 * says what's paid each month; the debts table says what's left.
 */

type Debt = typeof schema.debts.$inferSelect;

export type LoanRow = {
  debt: Debt;
  /** Moved by bank payments since the last balance typed in. */
  estimated: boolean;
  lastPayment: { date: string; amount: number } | null;
  /** Months to pay off at the plan's payment (or the minimum), and the month it ends. */
  payoff: { months: number; month: string } | null;
  /** The contract's last payment, when the loan's notes say. */
  contractEnd: string | null;
  cycle: CyclePayment | null;
  /** The plan line paying this loan, if any. */
  planLine: { label: string; amount: number; note: string | null } | null;
};

export type PlanDebt = {
  label: string;
  monthly: number;
  /** Cents; null when nobody tracks the balance. */
  balance: number | null;
  balanceNote: string;
  apr: number | null;
  note: string | null;
  cycles: CyclePayment[];
};

export type DebtsPicture = {
  today: string;
  loans: LoanRow[];
  unpaid: LoanRow[];
  paidOff: { debt: Debt; paidOn: string | null }[];
  planDebts: PlanDebt[];
  cycles: CyclePayment[];
  totals: {
    owed: number;
    monthly: number;
    interestMonthly: number;
    debtFree: { months: number; month: string } | null;
  };
  payoffOrder: { name: string; month: string }[];
};

const DEBT_LINE = /loan|card|irs|installment|lease/i;
const lenderKey = (name: string) => name.replace(/\(.*?\)/g, "").replace(/[^a-z\s]/gi, " ").trim().split(/\s+/)[0].toLowerCase();

function monthLabel(monthsAhead: number, today: string): string {
  const d = new Date(today + "T00:00:00");
  return new Date(d.getFullYear(), d.getMonth() + monthsAhead, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function getDebtsPicture(): DebtsPicture {
  const today = todayIso();
  const { config, lines } = loadPlan();
  const debts = db.select().from(schema.debts).all();
  const cycles = getCyclePayments(today);

  const debtLines = lines.filter((l) => DEBT_LINE.test(l.label) && l.amount > 0);
  const claimedLines = new Set<string>();

  const toRow = (d: Debt): LoanRow => {
    const payments = db
      .select()
      .from(schema.debtPayments)
      .where(eq(schema.debtPayments.debtId, d.id))
      .orderBy(desc(schema.debtPayments.date))
      .all();
    // The plan line paying this loan: same kind of loan, same payment.
    const line =
      debtLines.find(
        (l) => !claimedLines.has(l.id) && (/auto loan/i.test(l.label) ? d.type === "auto_loan" : lenderKey(l.label) === lenderKey(d.creditorName)) && Math.abs(l.amount - d.minimumPayment) <= d.minimumPayment * 0.1,
      ) ?? null;
    if (line) claimedLines.add(line.id);
    const pay = line?.amount ?? d.minimumPayment;
    const sim = d.currentBalance > 0 ? singleDebtPayoff(d.currentBalance, pay, d.interestRate) : null;
    const end = d.notes?.match(/final (\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
    return {
      debt: d,
      estimated: payments.some((p) => p.notes?.startsWith("Seen in the bank")),
      lastPayment: payments[0] ? { date: payments[0].date, amount: payments[0].amount } : null,
      payoff: sim?.months != null ? { months: sim.months, month: monthLabel(sim.months, today) } : null,
      contractEnd: end,
      cycle: cycles.find((c) => c.debtId === d.id) ?? null,
      planLine: line ? { label: line.label, amount: line.amount, note: line.note } : null,
    };
  };

  const active = debts.filter((d) => d.status === "active" && d.currentBalance > 0).map(toRow);
  // Not being paid: no plan line, and nothing paid in two months.
  const isUnpaid = (r: LoanRow) => !r.planLine && (!r.lastPayment || daysBetween(r.lastPayment.date, today) > 60);
  const loans = active.filter((r) => !isUnpaid(r));
  const unpaid = active.filter(isUnpaid);

  const paidOff = debts
    .filter((d) => d.status === "paid_off" || (d.status === "active" && d.currentBalance === 0))
    .map((d) => {
      const last = db.select({ date: schema.debtPayments.date }).from(schema.debtPayments).where(eq(schema.debtPayments.debtId, d.id)).orderBy(desc(schema.debtPayments.date)).get();
      return { debt: d, paidOn: last?.date ?? null };
    });

  const usedCycles = new Set(loans.map((l) => l.cycle?.scheduleId).filter(Boolean));
  const planDebts: PlanDebt[] = debtLines
    .filter((l) => !claimedLines.has(l.id))
    .map((l) => {
      const irs = /irs/i.test(l.label);
      const card = /card/i.test(l.label);
      const balance = irs ? Math.round(config.tax.irsBalanceFallback * 100) : card ? Math.round(config.card.balance * 100) : null;
      return {
        label: l.label,
        monthly: l.amount,
        balance,
        balanceNote: irs ? "Pre-marriage balance, from the plan" : card ? "From the plan's card inputs" : "Not tracked",
        apr: card ? config.card.apr / 100 : null,
        note: l.note,
        cycles: cycles.filter((c) => !usedCycles.has(c.scheduleId) && lenderKey(c.name) === lenderKey(l.label.replace(/^ring\s*[—-]\s*/i, ""))),
      };
    });

  // One debt-free date: tracked loans plus April's card, each at its plan payment; a paid-off loan's payment rolls to the next.
  const sim = simulateDebtPayoff(
    [
      ...loans.map((r) => ({ id: r.debt.id, creditorName: r.debt.creditorName, currentBalance: r.debt.currentBalance, interestRate: r.debt.interestRate, minimumPayment: r.planLine?.amount ?? r.debt.minimumPayment })),
      ...planDebts
        .filter((p) => p.balance && p.apr !== null)
        .map((p) => ({ id: p.label, creditorName: p.label, currentBalance: p.balance!, interestRate: p.apr!, minimumPayment: p.monthly })),
    ],
    0,
  );

  const owed = loans.reduce((s, r) => s + r.debt.currentBalance, 0) + planDebts.reduce((s, p) => s + (p.balance ?? 0), 0);
  const interestMonthly =
    loans.reduce((s, r) => s + (r.debt.currentBalance * r.debt.interestRate) / 12, 0) +
    planDebts.reduce((s, p) => s + (p.balance && p.apr ? (p.balance * p.apr) / 12 : 0), 0);

  return {
    today,
    loans,
    unpaid,
    paidOff,
    planDebts,
    cycles,
    totals: {
      owed,
      monthly: debtLines.reduce((s, l) => s + l.amount, 0),
      interestMonthly: Math.round(interestMonthly),
      debtFree: sim.monthsToDebtFree != null ? { months: sim.monthsToDebtFree, month: monthLabel(sim.monthsToDebtFree, today) } : null,
    },
    payoffOrder: sim.payoffOrder.map((p) => ({ name: p.creditorName, month: monthLabel(p.payoffMonth, today) })),
  };
}

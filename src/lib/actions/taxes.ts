import { db, schema } from "@/lib/db";
import { eq, and, gte, lte, desc, like, or } from "drizzle-orm";
import { newId } from "@/lib/utils/ids";
import { now, today, parseDollarsToCents } from "@/lib/utils/format";

export type CreateTaxObligationInput = {
  type:
    | "federal_income"
    | "state_income"
    | "back_taxes"
    | "estimated_quarterly"
    | "penalty"
    | "other";
  taxYear: number;
  originalAmount: number; // dollars
  remainingBalance?: number; // dollars; defaults to originalAmount
  agency: string;
  dueDate?: string; // ISO YYYY-MM-DD
  isInstallmentPlan?: boolean;
  installmentAmount?: number; // dollars
  installmentDay?: number; // 1-31
  penaltyRate?: number; // percent, e.g. 8 → stored as 0.08
  referenceNumber?: string;
  notes?: string;
};

export type CreateTaxObligationResult =
  | { success: true; id: string }
  | { success: false; error: string };

export function createTaxObligation(input: CreateTaxObligationInput): CreateTaxObligationResult {
  if (!input.agency?.trim()) return { success: false, error: "agency is required" };
  if (!Number.isFinite(input.taxYear)) return { success: false, error: "taxYear is required" };
  if (!Number.isFinite(input.originalAmount) || input.originalAmount <= 0) {
    return { success: false, error: "originalAmount must be a positive number" };
  }

  const original = parseDollarsToCents(input.originalAmount);
  const remaining =
    input.remainingBalance !== undefined && Number.isFinite(input.remainingBalance) && input.remainingBalance >= 0
      ? parseDollarsToCents(input.remainingBalance)
      : original;

  const id = newId();
  const timestamp = now();

  db.insert(schema.taxObligations).values({
    id,
    type: input.type,
    taxYear: input.taxYear,
    originalAmount: original,
    remainingBalance: remaining,
    dueDate: input.dueDate ?? null,
    agency: input.agency.trim(),
    isInstallmentPlan: input.isInstallmentPlan ?? false,
    installmentAmount:
      input.installmentAmount !== undefined && Number.isFinite(input.installmentAmount)
        ? parseDollarsToCents(input.installmentAmount)
        : null,
    installmentDay: input.installmentDay ?? null,
    penaltyRate:
      input.penaltyRate !== undefined && Number.isFinite(input.penaltyRate)
        ? input.penaltyRate / 100
        : null,
    referenceNumber: input.referenceNumber?.trim() || null,
    status: "active",
    notes: input.notes?.trim() || null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();

  return { success: true, id };
}

// ============================================================
// LOG TAX PAYMENT
// ============================================================

export type LogTaxPaymentInput = {
  obligationId: string;
  amount: number; // dollars (positive)
  date?: string; // ISO YYYY-MM-DD; defaults today
  confirmationNumber?: string;
  method?: "direct_pay" | "eftps" | "check" | "payroll_deduction" | "other";
  notes?: string;
};

export type LogTaxPaymentResult =
  | { success: true; paymentId: string; remainingBalance: number; paidOff: boolean }
  | { success: false; error: string };

/**
 * Record a tax payment. Decrements the obligation's remaining_balance and
 * flips status to "paid" when remaining hits zero.
 */
export function logTaxPayment(input: LogTaxPaymentInput): LogTaxPaymentResult {
  if (!input.obligationId) return { success: false, error: "obligationId is required" };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { success: false, error: "amount must be a positive number" };
  }

  const obligation = db
    .select()
    .from(schema.taxObligations)
    .where(eq(schema.taxObligations.id, input.obligationId))
    .get();
  if (!obligation) return { success: false, error: `Tax obligation ${input.obligationId} not found` };

  const amountCents = parseDollarsToCents(input.amount);
  const remaining = Math.max(0, obligation.remainingBalance - amountCents);
  const paidOff = remaining === 0;
  const date = input.date ?? today();
  const timestamp = now();
  const paymentId = newId();

  db.insert(schema.taxPayments).values({
    id: paymentId,
    obligationId: obligation.id,
    amount: amountCents,
    date,
    confirmationNumber: input.confirmationNumber?.trim() || null,
    method: input.method ?? null,
    notes: input.notes?.trim() || null,
    createdAt: timestamp,
  }).run();

  db.update(schema.taxObligations)
    .set({
      remainingBalance: remaining,
      status: paidOff ? "paid" : obligation.status,
      updatedAt: timestamp,
    })
    .where(eq(schema.taxObligations.id, obligation.id))
    .run();

  return { success: true, paymentId, remainingBalance: remaining, paidOff };
}

// ============================================================
// READ HELPERS
// ============================================================

export type TaxObligationWithProgress = {
  id: string;
  type: string;
  taxYear: number;
  agency: string;
  originalAmount: number;
  remainingBalance: number;
  paidOff: number; // cents (original - remaining)
  pctPaid: number; // 0..100
  dueDate: string | null;
  isInstallmentPlan: boolean;
  installmentAmount: number | null;
  installmentDay: number | null;
  penaltyRate: number | null;
  referenceNumber: string | null;
  status: string;
  notes: string | null;
  payments: { id: string; amount: number; date: string; method: string | null; confirmationNumber: string | null }[];
};

export type TaxOverview = {
  active: TaxObligationWithProgress[];
  paid: TaxObligationWithProgress[];
  totalOwed: number; // active obligations only
  totalOriginal: number; // active obligations only
  totalPaidYTD: number; // sum of payments in current year
  nextDue: TaxObligationWithProgress | null;
};

export function getTaxOverview(): TaxOverview {
  const obligations = db
    .select()
    .from(schema.taxObligations)
    .orderBy(desc(schema.taxObligations.taxYear))
    .all();

  // Pull all payments and bucket by obligation.
  const allPayments = db.select().from(schema.taxPayments).orderBy(desc(schema.taxPayments.date)).all();
  const paymentsByObligation = new Map<string, typeof allPayments>();
  for (const p of allPayments) {
    const arr = paymentsByObligation.get(p.obligationId) ?? [];
    arr.push(p);
    paymentsByObligation.set(p.obligationId, arr);
  }

  const enriched: TaxObligationWithProgress[] = obligations.map((o) => {
    const paid = Math.max(0, o.originalAmount - o.remainingBalance);
    const pct = o.originalAmount > 0 ? Math.round((paid / o.originalAmount) * 100) : 0;
    const ownPayments = (paymentsByObligation.get(o.id) ?? []).map((p) => ({
      id: p.id,
      amount: p.amount,
      date: p.date,
      method: p.method,
      confirmationNumber: p.confirmationNumber,
    }));
    return {
      id: o.id,
      type: o.type,
      taxYear: o.taxYear,
      agency: o.agency,
      originalAmount: o.originalAmount,
      remainingBalance: o.remainingBalance,
      paidOff: paid,
      pctPaid: pct,
      dueDate: o.dueDate,
      isInstallmentPlan: o.isInstallmentPlan,
      installmentAmount: o.installmentAmount,
      installmentDay: o.installmentDay,
      penaltyRate: o.penaltyRate,
      referenceNumber: o.referenceNumber,
      status: o.status,
      notes: o.notes,
      payments: ownPayments,
    };
  });

  const active = enriched.filter((o) => o.status === "active" || o.status === "upcoming" || o.status === "overdue");
  const paid = enriched.filter((o) => o.status === "paid");

  const totalOwed = active.reduce((s, o) => s + o.remainingBalance, 0);
  const totalOriginal = active.reduce((s, o) => s + o.originalAmount, 0);

  const yearStart = `${new Date().getFullYear()}-01-01`;
  const yearEnd = `${new Date().getFullYear()}-12-31`;
  const ytd = db
    .select({ total: schema.taxPayments.amount })
    .from(schema.taxPayments)
    .where(and(gte(schema.taxPayments.date, yearStart), lte(schema.taxPayments.date, yearEnd)))
    .all();
  const totalPaidYTD = ytd.reduce((s, p) => s + (p.total ?? 0), 0);

  // Next due — earliest due_date among active.
  const todayStr = today();
  const upcoming = active
    .filter((o) => o.dueDate)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const nextDue = upcoming.find((o) => (o.dueDate ?? "") >= todayStr) ?? upcoming[0] ?? null;

  return { active, paid, totalOwed, totalOriginal, totalPaidYTD, nextDue };
}

// ============================================================
// WHAT THE BANK SHOWS (the /tax page)
// ============================================================

/** An IRS debit: "IRS", "IRS USATAXPYMT", "US TREASURY 303". Word-bounded so "FIRST" doesn't match. */
const IRS_RE = /\bIRS\b|\bTREAS(URY)?\b|USATAXPYMT/i;

/**
 * The household plan's IRS balance ("about $12,533") comes from
 * "April and AJ's Financial Plan v1", dated 25 Oct 2026. Payments the bank
 * shows after this date come off it; interest and penalties are not modelled.
 */
export const IRS_FALLBACK_AS_OF = "2026-10-25";

/** Days past the usual payment day before a month with no payment is flagged as missing. */
const IRS_GRACE_DAYS = 3;

export type IrsPaymentSeen = { id: string; date: string; amount: number; account: string };

export type IrsMonth = {
  month: string; // YYYY-MM
  expected: string; // YYYY-MM-DD, the usual payment day in that month
  paid: number; // dollars
  dates: string[];
  status: "paid" | "missing" | "due" | "upcoming";
};

export type TaxPicture = {
  today: string;
  irs: {
    tracked: boolean; // a tax_obligations row for the IRS exists
    balance: number; // dollars — tracked remaining, or the plan figure less payments seen since
    baseline: number;
    baselineAsOf: string;
    paidSinceBaseline: number;
    monthly: number | null; // the plan line, dollars
    payments: IrsPaymentSeen[];
    months: IrsMonth[];
    usualDay: number | null;
    payingAccount: { name: string; lastSynced: string | null } | null;
    /** Checking accounts with no activity since before a missing payment was due — they could hide it. */
    quietAccounts: { name: string; lastActivity: string }[];
  };
  obligations: TaxObligationWithProgress[];
  draws: { total: number; count: number; amount: number | null; first: string | null; last: string | null };
  otherPay: { label: string; note: string; total: number; count: number; first: string; last: string }[];
};

/** Deposits in 2026 that may belong on the return but aren't Navusoft or Meridian draws. */
const OTHER_PAYERS: Array<{ re: RegExp; label: string; note: string }> = [
  {
    re: /A\.?\s?S\.? Infinite/i,
    label: "A.S. Infinite Solutions payroll (Gusto)",
    note: "Paid through Gusto with tax taken out, so it is wages: expect a W-2 from whoever ran the payroll, and its withholding counts too. Confirm whether it was Meridian money.",
  },
  {
    re: /Delta Waste/i,
    label: "Delta Waste Solutions",
    note: "A one-off deposit. If it was consulting pay it is self-employment income and should come with a 1099-NEC.",
  },
];

/** "Capital One 360 Checking", "Chime checking": the bank leads, as on Balances. */
function accountLabel(a: { name: string; institution: string }): string {
  const raw = a.institution.replace(/\s*\(.*\)\s*$/, "").trim();
  const inst = raw.replace(/\s+/g, "").toLowerCase() === "capitalone" ? "Capital One" : raw;
  if (!inst) return a.name;
  if (/^(checking|savings)$/i.test(a.name.trim())) return `${inst} ${a.name.trim().toLowerCase()}`;
  return a.name.toLowerCase().startsWith(inst.toLowerCase()) ? a.name : `${inst} ${a.name}`;
}

const monthKey = (d: string) => d.slice(0, 7);
const addMonth = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1 + n, 1).toLocaleDateString("en-CA").slice(0, 7);
};
const dayIn = (ym: string, day: number) => {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return new Date(y, m - 1, Math.min(day, last)).toLocaleDateString("en-CA");
};
const plusDays = (d: string, n: number) => {
  const x = new Date(d + "T00:00:00");
  x.setDate(x.getDate() + n);
  return x.toLocaleDateString("en-CA");
};

export function getTaxPicture(irsBalanceFallback: number): TaxPicture {
  const todayStr = today();
  const overview = getTaxOverview();
  const accounts = db.select().from(schema.accounts).all();
  const accountName = new Map(accounts.map((a) => [a.id, accountLabel(a)]));

  // --- IRS installment ---------------------------------------------------
  const irsTx = db
    .select()
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.type, "expense"),
        or(
          like(schema.transactions.merchant, "%IRS%"),
          like(schema.transactions.description, "%IRS%"),
          like(schema.transactions.description, "%TREAS%"),
          like(schema.transactions.description, "%USATAXPYMT%"),
        ),
      ),
    )
    .all()
    .filter((t) => IRS_RE.test(`${t.merchant ?? ""} ${t.description}`))
    .sort((a, b) => a.date.localeCompare(b.date));
  const payments: IrsPaymentSeen[] = irsTx.map((t) => ({
    id: t.id,
    date: t.date,
    amount: t.amount / 100,
    account: (t.accountId && accountName.get(t.accountId)) || "an unknown account",
  }));

  const planLine = db
    .select()
    .from(schema.householdLines)
    .all()
    .find((l) => /\bIRS\b/i.test(l.label));

  const days = payments.map((p) => Number(p.date.slice(8, 10))).sort((a, b) => a - b);
  const usualDay = days.length ? days[Math.floor((days.length - 1) / 2)] : null;

  const months: IrsMonth[] = [];
  if (payments.length && usualDay !== null) {
    const thisMonth = monthKey(todayStr);
    for (let m = monthKey(payments[0].date); m <= addMonth(thisMonth, 1); m = addMonth(m, 1)) {
      const inMonth = payments.filter((p) => monthKey(p.date) === m);
      const expected = dayIn(m, usualDay);
      const paid = inMonth.reduce((s, p) => s + p.amount, 0);
      const status: IrsMonth["status"] =
        paid > 0 ? "paid" : m > thisMonth ? "upcoming" : todayStr > plusDays(expected, IRS_GRACE_DAYS) ? "missing" : "due";
      months.push({ month: m, expected, paid, dates: inMonth.map((p) => p.date), status });
    }
  }

  const lastPayment = irsTx.at(-1);
  const paidFrom = lastPayment?.accountId ? accounts.find((x) => x.id === lastPayment.accountId) : undefined;
  const payingAccount = paidFrom ? { name: accountLabel(paidFrom), lastSynced: paidFrom.lastSynced } : null;

  const firstMissing = months.find((m) => m.status === "missing");
  const quietAccounts: TaxPicture["irs"]["quietAccounts"] = [];
  if (firstMissing) {
    for (const a of accounts) {
      if (a.excludeFromReports || a.accountType !== "depository" || !/checking/i.test(a.name)) continue;
      const last = db
        .select({ date: schema.transactions.date })
        .from(schema.transactions)
        .where(eq(schema.transactions.accountId, a.id))
        .orderBy(desc(schema.transactions.date))
        .limit(1)
        .get();
      if (last && last.date < firstMissing.expected) quietAccounts.push({ name: accountLabel(a), lastActivity: last.date });
    }
  }

  const trackedIrs = overview.active.filter((o) => o.agency.toUpperCase() === "IRS");
  const paidSinceBaseline = payments.filter((p) => p.date > IRS_FALLBACK_AS_OF).reduce((s, p) => s + p.amount, 0);
  const balance = trackedIrs.length
    ? trackedIrs.reduce((s, o) => s + o.remainingBalance, 0) / 100
    : Math.max(0, irsBalanceFallback - paidSinceBaseline);

  // --- Meridian draws ------------------------------------------------------
  // Owner's Draw deposits, plus any deposit naming a business account's last
  // four (the 27 May draw landed in Simply Checking as a transfer).
  const bizAccounts = accounts.filter((a) => /business/i.test(a.name));
  const bizFours = bizAccounts.map((a) => a.lastFour).filter((f): f is string => !!f);
  const bizIds = new Set(bizAccounts.map((a) => a.id));
  const income2026 = db
    .select()
    .from(schema.transactions)
    .where(and(eq(schema.transactions.type, "income"), gte(schema.transactions.date, `${todayStr.slice(0, 4)}-01-01`)))
    .all()
    .filter((t) => !t.accountId || !bizIds.has(t.accountId));
  const draws = income2026
    .filter((t) => t.categoryId === "cat_owners_draw" || bizFours.some((f) => t.description.includes(`XXXXXX${f}`)))
    .sort((a, b) => a.date.localeCompare(b.date));
  const drawAmounts = new Set(draws.map((d) => d.amount));

  const otherPay = OTHER_PAYERS.flatMap((p) => {
    const rows = income2026
      .filter((t) => p.re.test(`${t.merchant ?? ""} ${t.description}`) && t.amount >= 10000)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (rows.length === 0) return [];
    return [
      {
        label: p.label,
        note: p.note,
        total: rows.reduce((s, t) => s + t.amount, 0) / 100,
        count: rows.length,
        first: rows[0].date,
        last: rows[rows.length - 1].date,
      },
    ];
  });

  return {
    today: todayStr,
    irs: {
      tracked: trackedIrs.length > 0,
      balance,
      baseline: irsBalanceFallback,
      baselineAsOf: IRS_FALLBACK_AS_OF,
      paidSinceBaseline,
      monthly: planLine ? planLine.amount / 100 : null,
      payments,
      months,
      usualDay,
      payingAccount,
      quietAccounts,
    },
    obligations: overview.active,
    draws: {
      total: draws.reduce((s, t) => s + t.amount, 0) / 100,
      count: draws.length,
      amount: drawAmounts.size === 1 ? [...drawAmounts][0] / 100 : null,
      first: draws[0]?.date ?? null,
      last: draws.at(-1)?.date ?? null,
    },
    otherPay,
  };
}


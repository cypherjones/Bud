import { db, schema } from "@/lib/db";
import { eq, and, gte, lte, desc } from "drizzle-orm";
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


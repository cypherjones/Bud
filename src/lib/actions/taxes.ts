import { db, schema } from "@/lib/db";
import { newId } from "@/lib/utils/ids";
import { now, parseDollarsToCents } from "@/lib/utils/format";

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

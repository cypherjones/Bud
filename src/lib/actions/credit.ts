import { db, schema } from "@/lib/db";
import { newId } from "@/lib/utils/ids";
import { now, parseDollarsToCents } from "@/lib/utils/format";

export type CreateCreditScoreInput = {
  score: number; // 300-850
  bureau?: "equifax" | "experian" | "transunion" | "fico" | "vantage";
  source?: string; // "Credit Karma", "bank app", etc.
  date?: string; // ISO YYYY-MM-DD; defaults today
  notes?: string;
  factors?: {
    utilizationRatio?: number; // 0..100 (percent)
    onTimePayments?: number; // months
    totalAccounts?: number;
    hardInquiries?: number; // last 24 months
    oldestAccountMonths?: number;
    derogatoryMarks?: number;
    totalBalance?: number; // dollars
    totalCreditLimit?: number; // dollars
  };
};

export type CreateCreditScoreResult =
  | { success: true; scoreId: string; factorsId: string | null }
  | { success: false; error: string };

/**
 * Insert a credit-score snapshot. When `factors` are provided, also writes a
 * matching credit_factors row tied to the new scoreId. Both are pure inserts
 * — history grows over time so the score-history chart on /credit fills in.
 */
export function createCreditScore(input: CreateCreditScoreInput): CreateCreditScoreResult {
  if (!Number.isFinite(input.score)) return { success: false, error: "score is required" };
  if (input.score < 300 || input.score > 850) {
    return { success: false, error: "score must be between 300 and 850" };
  }

  const id = newId();
  const timestamp = now();
  const date = input.date ?? new Date().toISOString().split("T")[0];

  db.insert(schema.creditScores).values({
    id,
    score: Math.round(input.score),
    bureau: input.bureau ?? null,
    source: input.source?.trim() || null,
    date,
    notes: input.notes?.trim() || null,
    createdAt: timestamp,
  }).run();

  let factorsId: string | null = null;
  if (input.factors) {
    factorsId = newId();
    const f = input.factors;
    db.insert(schema.creditFactors).values({
      id: factorsId,
      scoreId: id,
      utilizationRatio:
        f.utilizationRatio !== undefined && Number.isFinite(f.utilizationRatio)
          ? f.utilizationRatio / 100
          : null,
      onTimePayments: f.onTimePayments ?? null,
      totalAccounts: f.totalAccounts ?? null,
      hardInquiries: f.hardInquiries ?? null,
      oldestAccountMonths: f.oldestAccountMonths ?? null,
      derogatoryMarks: f.derogatoryMarks ?? null,
      totalBalance:
        f.totalBalance !== undefined && Number.isFinite(f.totalBalance)
          ? parseDollarsToCents(f.totalBalance)
          : null,
      totalCreditLimit:
        f.totalCreditLimit !== undefined && Number.isFinite(f.totalCreditLimit)
          ? parseDollarsToCents(f.totalCreditLimit)
          : null,
      notes: null,
      createdAt: timestamp,
    }).run();
  }

  return { success: true, scoreId: id, factorsId };
}

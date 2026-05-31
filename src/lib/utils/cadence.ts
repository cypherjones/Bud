// Cadence inference for recurring charges. Used by reports/getSubscriptionAudit
// and dashboard/getKillList to compute a per-merchant `monthlyCost` from the
// historical charge log rather than guessing with max(amount) or assuming a
// monthly cadence.
//
// Method:
//   1. Sort charges by date, compute day-gaps between consecutive charges.
//   2. Median gap → cadence bucket (weekly / biweekly / monthly / yearly).
//   3. Median amount across charges → per-occurrence cost.
//   4. monthlyCost = perOccurrence × occurrencesPerMonth.
//
// Single-charge merchants fall back to a monthly assumption (best default for
// anything tagged #recurring). Irregular gaps also fall through to monthly.

export type Charge = { date: string; amount: number };

export function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

/** Median gap → occurrences-per-month. 1 for irregular / single-charge cases. */
export function occurrencesPerMonth(gaps: number[]): number {
  if (gaps.length === 0) return 1;
  const med = median(gaps);
  if (med >= 5 && med <= 9) return 52 / 12;       // weekly
  if (med >= 12 && med <= 17) return 26 / 12;     // biweekly
  if (med >= 28 && med <= 35) return 1;           // monthly
  if (med >= 350 && med <= 380) return 1 / 12;    // yearly
  return 1;                                        // irregular fallback
}

export type CadenceInference = {
  monthlyCost: number;
  medianAmount: number;
  perMonth: number;
  lastSeen: string;
  count: number;
};

/**
 * Reduce a charge history into a monthly cost estimate. Sorts the input by
 * date ascending; safe to pass an unsorted array.
 *
 * Returns `lastSeen = ""` and `monthlyCost = 0` for an empty input (caller
 * should filter zero-charge merchants out before calling, but the function
 * doesn't crash if you don't).
 */
export function inferMonthlyCost(charges: Charge[]): CadenceInference {
  if (charges.length === 0) {
    return { monthlyCost: 0, medianAmount: 0, perMonth: 1, lastSeen: "", count: 0 };
  }
  const sorted = [...charges].sort((a, b) => a.date.localeCompare(b.date));
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].date + "T00:00:00").getTime();
    const curr = new Date(sorted[i].date + "T00:00:00").getTime();
    gaps.push(Math.round((curr - prev) / 86400000));
  }
  const perMonth = occurrencesPerMonth(gaps);
  const medianAmount = median(sorted.map((c) => c.amount));
  const monthlyCost = Math.round(medianAmount * perMonth);
  return {
    monthlyCost,
    medianAmount,
    perMonth,
    lastSeen: sorted[sorted.length - 1].date,
    count: sorted.length,
  };
}

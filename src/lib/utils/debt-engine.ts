import { formatCurrency } from "./format";

type Debt = {
  id: string;
  creditorName: string;
  type: string;
  currentBalance: number; // cents
  interestRate: number; // annual decimal
  minimumPayment: number; // cents
  creditLimit: number | null; // cents
  status: string;
};

type PlanContext = {
  targetAmount: number | null;
  currentSaved: number;
  targetDate: string | null;
} | undefined;

type AllocationResult = {
  month: string;
  total_budget: string;
  total_minimums: string;
  surplus: string;
  allocations: {
    creditor: string;
    type: string;
    balance: string;
    payment: string;
    breakdown: string;
    reasoning: string;
    priority_score: number;
  }[];
  projected_impact: string;
};

/**
 * Smart multi-factor debt allocation engine.
 *
 * Scores each debt across 5 factors:
 * 1. Interest cost (30%) — real dollars lost per month
 * 2. Credit utilization (25%) — proximity to 30%/10% thresholds
 * 3. Goal unlocking (20%) — how much paying off this debt frees for other goals
 * 4. Penalty rate (15%) — tax debts/collections with high penalty rates
 * 5. Quick win (10%) — small remaining balance = close it out fast
 */
export function calculateDebtAllocation(
  debts: Debt[],
  monthlyBudget: number,
  movePlan?: PlanContext
): AllocationResult {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const totalMinimums = debts.reduce((s, d) => s + d.minimumPayment, 0);
  const surplus = Math.max(0, monthlyBudget - totalMinimums);

  // Score each debt
  const scored = debts.map((debt) => {
    const scores = {
      interestCost: scoreInterestCost(debt, debts),
      creditUtilization: scoreCreditUtilization(debt),
      goalUnlocking: scoreGoalUnlocking(debt, movePlan),
      penaltyRate: scorePenaltyRate(debt),
      quickWin: scoreQuickWin(debt, debts),
    };

    const weighted =
      scores.interestCost * 0.30 +
      scores.creditUtilization * 0.25 +
      scores.goalUnlocking * 0.20 +
      scores.penaltyRate * 0.15 +
      scores.quickWin * 0.10;

    return { debt, scores, weighted };
  });

  // Sort by weighted score descending
  scored.sort((a, b) => b.weighted - a.weighted);

  // Allocate: minimums first, then surplus by priority
  let remainingSurplus = surplus;
  const allocations = scored.map(({ debt, scores, weighted }) => {
    let extraPayment = 0;
    if (remainingSurplus > 0) {
      // Give proportional to score, but at least try to give top debt the most
      extraPayment = Math.min(remainingSurplus, debt.currentBalance - debt.minimumPayment);
      extraPayment = Math.max(0, extraPayment);
    }

    return { debt, scores, weighted, extraPayment };
  });

  // Distribute surplus: top priority gets first dibs
  let leftover = surplus;
  for (const alloc of allocations) {
    if (leftover <= 0) break;
    const maxExtra = Math.max(0, alloc.debt.currentBalance - alloc.debt.minimumPayment);
    const give = Math.min(leftover, maxExtra);
    alloc.extraPayment = give;
    leftover -= give;
  }

  // Build output
  const result: AllocationResult = {
    month,
    total_budget: formatCurrency(monthlyBudget),
    total_minimums: formatCurrency(totalMinimums),
    surplus: formatCurrency(surplus),
    allocations: allocations.map(({ debt, scores, weighted, extraPayment }) => {
      const totalPayment = debt.minimumPayment + extraPayment;
      const reasoning = buildReasoning(debt, scores, extraPayment);

      return {
        creditor: debt.creditorName,
        type: debt.type,
        balance: formatCurrency(debt.currentBalance),
        payment: formatCurrency(totalPayment),
        breakdown: extraPayment > 0
          ? `${formatCurrency(debt.minimumPayment)} min + ${formatCurrency(extraPayment)} extra`
          : `${formatCurrency(debt.minimumPayment)} min only`,
        reasoning,
        priority_score: Math.round(weighted * 100) / 100,
      };
    }),
    projected_impact: buildProjectedImpact(allocations, surplus),
  };

  return result;
}

// === SCORING FUNCTIONS (each returns 0-1) ===

function scoreInterestCost(debt: Debt, allDebts: Debt[]): number {
  // Monthly interest cost in real dollars
  const monthlyCost = debt.currentBalance * (debt.interestRate / 12);
  const maxCost = Math.max(...allDebts.map((d) => d.currentBalance * (d.interestRate / 12)));
  if (maxCost === 0) return 0;
  return monthlyCost / maxCost;
}

function scoreCreditUtilization(debt: Debt): number {
  if (!debt.creditLimit || debt.creditLimit === 0) return 0;

  const utilization = debt.currentBalance / debt.creditLimit;

  // High score if we're near a threshold crossing
  if (utilization > 0.30 && utilization <= 0.40) return 1.0; // Very close to crossing 30%
  if (utilization > 0.40 && utilization <= 0.50) return 0.8;
  if (utilization > 0.50) return 0.6;
  if (utilization > 0.10 && utilization <= 0.15) return 0.7; // Near 10% threshold
  if (utilization > 0.15 && utilization <= 0.30) return 0.3;
  return 0.1; // Already below 10%, low priority
}

function scoreGoalUnlocking(debt: Debt, movePlan?: PlanContext): number {
  if (!movePlan) return 0.3; // Base score without context

  const monthlyFreed = debt.minimumPayment;
  const monthsToPayoff = debt.currentBalance / debt.minimumPayment;

  // If the debt can be paid off soon and frees significant monthly cash
  if (monthsToPayoff <= 3 && monthlyFreed >= 5000) return 1.0; // $50+ freed within 3 months
  if (monthsToPayoff <= 6 && monthlyFreed >= 10000) return 0.8; // $100+ freed within 6 months
  if (monthlyFreed >= 15000) return 0.6; // Large minimum payment

  return 0.2;
}

function scorePenaltyRate(debt: Debt): number {
  // Tax debts and collections often have special penalty rates
  if (debt.type === "tax_debt") return 0.9;
  if (debt.type === "medical" && debt.interestRate === 0) return 0.1; // No-interest medical
  if (debt.interestRate > 0.25) return 0.8; // >25% APR
  if (debt.interestRate > 0.20) return 0.5;
  return 0.2;
}

function scoreQuickWin(debt: Debt, allDebts: Debt[]): number {
  const minBalance = Math.min(...allDebts.map((d) => d.currentBalance));
  const maxBalance = Math.max(...allDebts.map((d) => d.currentBalance));
  if (maxBalance === minBalance) return 0.5;

  // Lower balance = higher quick win score
  const normalized = 1 - (debt.currentBalance - minBalance) / (maxBalance - minBalance);

  // Extra boost if under $500 from payoff
  if (debt.currentBalance <= 50000) return Math.min(1.0, normalized + 0.3); // $500
  return normalized;
}

// === REASONING BUILDER ===

function buildReasoning(
  debt: Debt,
  scores: Record<string, number>,
  extraPayment: number
): string {
  const reasons: string[] = [];

  if (scores.interestCost > 0.7) {
    const monthlyCost = Math.round(debt.currentBalance * (debt.interestRate / 12));
    reasons.push(`Costing ${formatCurrency(monthlyCost)}/mo in interest — highest cost debt`);
  }

  if (scores.creditUtilization > 0.7 && debt.creditLimit) {
    const util = Math.round((debt.currentBalance / debt.creditLimit) * 100);
    if (util > 30) {
      const toThreshold = debt.currentBalance - Math.round(debt.creditLimit * 0.30);
      reasons.push(`Utilization at ${util}%. Need ${formatCurrency(toThreshold)} more to cross below 30% — score boost`);
    }
  }

  if (scores.quickWin > 0.7 && debt.currentBalance <= 50000) {
    reasons.push(`Only ${formatCurrency(debt.currentBalance)} left — close this out to free ${formatCurrency(debt.minimumPayment)}/mo`);
  }

  if (scores.penaltyRate > 0.7 && debt.type === "tax_debt") {
    reasons.push("Tax debt — missing payments risks defaulting installment agreement");
  }

  if (scores.goalUnlocking > 0.6) {
    reasons.push(`Paying this off frees ${formatCurrency(debt.minimumPayment)}/mo for other goals`);
  }

  if (reasons.length === 0) {
    reasons.push("Minimum payment to stay current");
  }

  return reasons.join(". ") + ".";
}

/**
 * Months until a debt with given balance is paid off, paying monthlyPayment
 * at annualRate (decimal, e.g. 0.22 for 22%). Accounts for interest.
 *
 * Returns null when the payment doesn't cover the monthly interest accrual
 * (i.e. balance never goes down).
 */
export function monthsToPayoff(balance: number, monthlyPayment: number, annualRate: number): number | null {
  if (balance <= 0) return 0;
  if (monthlyPayment <= 0) return null;
  const monthlyRate = annualRate / 12;
  if (monthlyRate <= 0) {
    return Math.ceil(balance / monthlyPayment);
  }
  const monthlyInterest = balance * monthlyRate;
  if (monthlyPayment <= monthlyInterest) return null; // never pays down

  // Closed-form amortization: n = -log(1 - B*i/P) / log(1+i)
  const n = -Math.log(1 - (balance * monthlyRate) / monthlyPayment) / Math.log(1 + monthlyRate);
  return Math.ceil(n);
}

/** Add `months` months to today and return the resulting Date. */
export function addMonths(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d;
}

function buildProjectedImpact(
  allocations: { debt: Debt; extraPayment: number }[],
  surplus: number
): string {
  if (surplus === 0) return "Currently only covering minimums. Any extra funds will accelerate payoff.";

  const impacts: string[] = [];
  for (const { debt, extraPayment } of allocations) {
    if (extraPayment > 0) {
      const monthsMinOnly = Math.ceil(debt.currentBalance / debt.minimumPayment);
      const monthsWithExtra = Math.ceil(debt.currentBalance / (debt.minimumPayment + extraPayment));
      if (monthsWithExtra < monthsMinOnly) {
        impacts.push(
          `${debt.creditorName}: payoff in ~${monthsWithExtra} months (vs ${monthsMinOnly} at minimums only)`
        );
      }
    }
  }

  return impacts.length > 0 ? impacts.join(". ") + "." : "Extra payments applied to highest-priority debt.";
}

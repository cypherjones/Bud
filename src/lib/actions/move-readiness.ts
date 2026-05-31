import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { getMetrics, getSavingsTarget } from "./dashboard";
import { getCreditTriage } from "./credit-triage";

export type MoveReadinessSignal = {
  label: string;
  status: "good" | "warn" | "bad" | "info";
  detail: string;
};

export type MoveReadinessBlocker = {
  severity: "high" | "medium" | "low";
  category: "savings" | "debt" | "credit" | "income";
  title: string;
  detail: string;
};

export type MoveReadiness = {
  hasMovePlan: boolean;
  moveDate: string | null; // YYYY-MM-DD
  daysUntilMove: number | null;
  monthsUntilMove: number | null;

  // Savings
  targetSavingsCents: number;
  currentSavedCents: number; // max(planRecorded, realSavingsBalance - earmarked)
  planRecordedSavedCents: number; // what the plan row says
  realSavingsBalanceCents: number; // sum of savings-account balances
  earmarks: { label: string; cents: number }[]; // non-move savings (e.g. tax reserve)
  earmarkedCents: number;
  planFieldOutOfDate: boolean; // true when plan field disagrees with bank balance
  remainingSavingsCents: number;
  requiredMonthlyPaceCents: number; // (target - saved) / months remaining
  currentMonthlyPaceCents: number; // trailing 30d deliberate-deposit pace
  paceStatus: "ahead" | "on_track" | "behind" | "critical" | "unknown";
  projectedSavedAtMoveCents: number | null; // saved + currentPace * months

  // Debt-to-Income (rentals usually want <40-45%)
  monthlyDebtMinsCents: number;
  trailing30IncomeCents: number;
  dtiRatio: number; // 0 to 1+
  dtiStatus: "good" | "warn" | "bad";

  // Composite readiness 0-100
  readinessScore: number;

  // Signals (positive + negative diagnostics)
  signals: MoveReadinessSignal[];

  // Blockers (specific things to fix)
  blockers: MoveReadinessBlocker[];

  // Top move-relevant credit items
  rentalRiskItems: Array<{
    creditor: string;
    balanceCents: number;
    category: string;
    status: string;
    note: string;
  }>;
};

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / 86400000);
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

export function getMoveReadiness(): MoveReadiness {
  const movePlan = db
    .select()
    .from(schema.financialPlans)
    .where(eq(schema.financialPlans.type, "move"))
    .get();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const moveDate = movePlan?.targetDate ?? null;
  const moveDateObj = moveDate ? new Date(moveDate + "T00:00:00") : null;
  const daysUntilMove = moveDateObj ? daysBetween(today, moveDateObj) : null;
  const monthsUntilMove = moveDateObj ? Math.max(0, monthsBetween(today, moveDateObj)) : null;

  // Savings figures: target comes from the move plan; "saved so far" is the
  // sum of actual savings-account balances minus any earmarks (e.g. tax
  // reserve from owner's draw). The plan.currentSaved field is user-edited
  // and goes stale fast — using the real account totals plus an earmarks
  // setting means the readiness card matches what's actually move-relevant.
  const targetSavingsCents = movePlan?.targetAmount ?? 0;
  const planRecordedSavedCents = movePlan?.currentSaved ?? 0;
  const savingsAccounts = db
    .select({ balance: schema.accounts.balance })
    .from(schema.accounts)
    .where(and(
      eq(schema.accounts.subtype, "savings"),
      eq(schema.accounts.excludeFromReports, false),
    ))
    .all();
  const realSavingsBalanceCents = savingsAccounts.reduce((s, a) => s + (a.balance ?? 0), 0);

  // Earmarks: portions of the savings balance reserved for non-move purposes
  // (e.g. tax set-asides from owner's draw). Stored as a JSON array under
  // settings.move_savings_earmarks so it can hold multiple labeled buckets.
  const earmarksRow = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "move_savings_earmarks"))
    .get();
  type Earmark = { label: string; cents: number };
  let earmarks: Earmark[] = [];
  if (earmarksRow) {
    try {
      const parsed = JSON.parse(earmarksRow.value);
      if (Array.isArray(parsed)) {
        earmarks = parsed
          .filter((e): e is Earmark => typeof e?.label === "string" && typeof e?.cents === "number" && e.cents >= 0)
          .map((e) => ({ label: e.label, cents: e.cents }));
      }
    } catch {
      // Malformed JSON — fall through with empty array.
    }
  }
  const earmarkedCents = earmarks.reduce((s, e) => s + e.cents, 0);

  // Use the higher of (a) the manually logged plan field or (b) the real
  // savings balance minus earmarks. We don't undercount when the user has
  // cash stashed elsewhere they've manually recorded.
  const moveRelevantSavingsCents = Math.max(0, realSavingsBalanceCents - earmarkedCents);
  const currentSavedCents = Math.max(planRecordedSavedCents, moveRelevantSavingsCents);
  const planFieldOutOfDate =
    Math.abs(planRecordedSavedCents - moveRelevantSavingsCents) > 2500;
  const remainingSavingsCents = Math.max(0, targetSavingsCents - currentSavedCents);

  const requiredMonthlyPaceCents =
    monthsUntilMove && monthsUntilMove > 0 ? Math.ceil(remainingSavingsCents / monthsUntilMove) : 0;

  // Current pace from the trailing-30-day deliberate-deposit signal
  const savingsTarget = getSavingsTarget();
  const currentMonthlyPaceCents = savingsTarget.alreadySaved;

  let paceStatus: MoveReadiness["paceStatus"] = "unknown";
  if (monthsUntilMove !== null && requiredMonthlyPaceCents > 0) {
    const ratio = currentMonthlyPaceCents / requiredMonthlyPaceCents;
    if (ratio >= 1.1) paceStatus = "ahead";
    else if (ratio >= 0.9) paceStatus = "on_track";
    else if (ratio >= 0.5) paceStatus = "behind";
    else paceStatus = "critical";
  } else if (remainingSavingsCents === 0 && targetSavingsCents > 0) {
    paceStatus = "ahead"; // already there
  }

  const projectedSavedAtMoveCents =
    monthsUntilMove !== null
      ? currentSavedCents + currentMonthlyPaceCents * monthsUntilMove
      : null;

  // DTI: monthly debt minimums vs trailing-30 income
  const activeDebts = db
    .select()
    .from(schema.debts)
    .where(eq(schema.debts.status, "active"))
    .all();
  const monthlyDebtMinsCents = activeDebts.reduce((s, d) => s + d.minimumPayment, 0);
  const metrics = getMetrics();
  const trailing30IncomeCents = metrics.trailing30Income ?? 0;
  const dtiRatio = trailing30IncomeCents > 0 ? monthlyDebtMinsCents / trailing30IncomeCents : 1;
  const dtiStatus: MoveReadiness["dtiStatus"] =
    dtiRatio < 0.4 ? "good" : dtiRatio < 0.55 ? "warn" : "bad";

  // Credit triage — pull rental-relevant + recent collections
  const triage = getCreditTriage();
  const rentalRiskItems = [...triage.collections, ...triage.chargeOffs]
    .filter((i) => i.status !== "settled" && i.status !== "removed")
    .filter((i) => {
      // Move-relevant: explicitly flagged, OR reported within last 12 months, OR a collection (collections always show)
      if (i.moveRelevant) return true;
      if (i.category === "collection") return true;
      if (!i.lastReportedDate) return false;
      const reported = new Date(i.lastReportedDate + "T00:00:00");
      const monthsAgo = monthsBetween(reported, today);
      return monthsAgo <= 12;
    })
    .sort((a, b) => b.balanceCents - a.balanceCents)
    .slice(0, 6)
    .map((i) => ({
      creditor: i.creditor,
      balanceCents: i.balanceCents,
      category: i.category,
      status: i.status,
      note:
        i.category === "collection"
          ? "Collections appear on most rental background checks"
          : i.moveRelevant
            ? "Flagged as visible to landlords"
            : "Recently reported derogatory",
    }));

  // Signals (diagnostics for the user, mix of positive and negative)
  const signals: MoveReadinessSignal[] = [];

  if (movePlan) {
    signals.push({
      label: "Move plan exists",
      status: "good",
      detail: `Target ${moveDate ?? "unset"}, ${currentSavedCents > 0 ? "saving started" : "no savings logged yet"}`,
    });
  } else {
    signals.push({
      label: "No move plan in the system",
      status: "warn",
      detail: "Create a move plan with target date and savings goal to track readiness here.",
    });
  }

  if (paceStatus !== "unknown") {
    signals.push({
      label: `Savings pace: ${paceStatus.replace("_", " ")}`,
      status: paceStatus === "ahead" || paceStatus === "on_track" ? "good" : paceStatus === "behind" ? "warn" : "bad",
      detail: `Saving ~$${(currentMonthlyPaceCents / 100).toFixed(0)}/mo vs $${(requiredMonthlyPaceCents / 100).toFixed(0)}/mo required`,
    });
  }

  signals.push({
    label: `DTI: ${(dtiRatio * 100).toFixed(0)}%`,
    status: dtiStatus,
    detail:
      dtiRatio < 0.4
        ? "Below 40% — most landlords accept this"
        : dtiRatio < 0.55
          ? "Above 40% — some landlords flag this; co-signer or larger deposit may help"
          : "Above 55% — most landlords require co-signer or 2-3x deposit",
  });

  signals.push({
    label: `${triage.collections.filter((c) => c.status !== "settled" && c.status !== "removed").length} active collection(s) on report`,
    status: triage.collections.filter((c) => c.status !== "settled" && c.status !== "removed").length === 0
      ? "good"
      : triage.collections.filter((c) => c.status !== "settled" && c.status !== "removed").length <= 2
        ? "warn"
        : "bad",
    detail: "Collections show on rental background checks regardless of credit score.",
  });

  // Blockers — concrete things to fix
  const blockers: MoveReadinessBlocker[] = [];

  if (paceStatus === "critical" || paceStatus === "behind") {
    const gap = Math.max(0, requiredMonthlyPaceCents - currentMonthlyPaceCents);
    blockers.push({
      severity: paceStatus === "critical" ? "high" : "medium",
      category: "savings",
      title: `Savings pace is ${paceStatus}`,
      detail: `Need an extra $${(gap / 100).toFixed(0)}/mo to hit $${(targetSavingsCents / 100).toFixed(0)} by ${moveDate}.`,
    });
  }

  if (dtiStatus === "bad") {
    blockers.push({
      severity: "high",
      category: "debt",
      title: "DTI too high for most rentals",
      detail: `Monthly debt minimums ($${(monthlyDebtMinsCents / 100).toFixed(0)}) exceed 55% of income ($${(trailing30IncomeCents / 100).toFixed(0)}).`,
    });
  } else if (dtiStatus === "warn") {
    blockers.push({
      severity: "medium",
      category: "debt",
      title: "DTI above 40%",
      detail: `Likely to require co-signer or 2x deposit. Settle one collection or pay down active debt minimum to reduce.`,
    });
  }

  // Active accounts with ongoing late marks
  const ongoingLateActives = activeDebts.filter((d) => {
    const note = (d.notes ?? "").toLowerCase();
    return note.includes("60-day") || note.includes("past due");
  });
  if (ongoingLateActives.length > 0) {
    blockers.push({
      severity: "high",
      category: "credit",
      title: `${ongoingLateActives.length} active account(s) with ongoing late marks`,
      detail: "Each new 60→90→120-day step is a major score and rental-readiness hit. Bring current first.",
    });
  }

  if (rentalRiskItems.length >= 3) {
    blockers.push({
      severity: "medium",
      category: "credit",
      title: `${rentalRiskItems.length} items likely visible to landlords`,
      detail: "Settle the smallest collections first — even $95-835 paid-with-delete cleans up the rental check.",
    });
  }

  if (monthsUntilMove !== null && monthsUntilMove < 3 && remainingSavingsCents > 0) {
    blockers.push({
      severity: "high",
      category: "savings",
      title: "Less than 3 months and savings still short",
      detail: `Consider tightening discretionary spend or adding a cushion via tax refund / bonus to close the gap.`,
    });
  }

  // Composite readiness score (0-100). Weighted blend.
  let readinessScore = 0;
  // Savings component (40 pts): 100% saved = 40
  if (targetSavingsCents > 0) {
    readinessScore += Math.min(40, (currentSavedCents / targetSavingsCents) * 40);
  } else {
    readinessScore += 20; // partial credit if no plan
  }
  // DTI component (25 pts): under 40% = full, scales to 0 at 70%
  if (dtiRatio < 0.4) readinessScore += 25;
  else if (dtiRatio < 0.55) readinessScore += 15;
  else if (dtiRatio < 0.7) readinessScore += 5;
  // Pace component (15 pts)
  readinessScore += paceStatus === "ahead" ? 15 : paceStatus === "on_track" ? 12 : paceStatus === "behind" ? 6 : 0;
  // Credit cleanup component (20 pts): fewer rental-visible items is better
  const visibleCount = rentalRiskItems.length;
  if (visibleCount === 0) readinessScore += 20;
  else if (visibleCount <= 2) readinessScore += 12;
  else if (visibleCount <= 4) readinessScore += 6;

  readinessScore = Math.round(Math.max(0, Math.min(100, readinessScore)));

  return {
    hasMovePlan: !!movePlan,
    moveDate,
    daysUntilMove,
    monthsUntilMove,
    targetSavingsCents,
    currentSavedCents,
    planRecordedSavedCents,
    realSavingsBalanceCents,
    earmarks,
    earmarkedCents,
    planFieldOutOfDate,
    remainingSavingsCents,
    requiredMonthlyPaceCents,
    currentMonthlyPaceCents,
    paceStatus,
    projectedSavedAtMoveCents,
    monthlyDebtMinsCents,
    trailing30IncomeCents,
    dtiRatio,
    dtiStatus,
    readinessScore,
    signals,
    blockers,
    rentalRiskItems,
  };
}

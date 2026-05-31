import { db, schema } from "@/lib/db";
import { desc, eq } from "drizzle-orm";
import { getCreditTriage } from "./credit-triage";

export type ScorePoint = {
  date: string; // YYYY-MM-DD
  score: number;
  bureau: string | null;
  source: string | null;
};

export type CreditTrajectory = {
  hasHistory: boolean;
  currentScore: number | null;
  earliestScore: ScorePoint | null;
  latestScore: ScorePoint | null;

  // Velocity (points per month)
  velocityPerMonth: number; // signed; positive = improving
  monthsObserved: number;

  // Move-date pacing — what does it take to hit 600 by Oct 1?
  moveDate: string | null;
  monthsUntilMove: number | null;
  pointsTo600: number;
  pointsTo670: number;
  requiredVelocityTo600: number | null; // pts/mo
  requiredVelocityTo670: number | null;
  paceStatus: "ahead" | "on_track" | "behind" | "critical" | "unknown";

  // History (most recent 12 entries, ascending for charting)
  history: ScorePoint[];

  // Top-impact items from triage (largest unresolved derogatories)
  topImpactItems: Array<{
    creditor: string;
    balanceCents: number;
    category: string;
    status: string;
    recommendation: string;
  }>;

  // Latest factors snapshot
  utilizationPct: number | null;
  utilizationTrend: "improving" | "stable" | "worsening" | null;
  derogatoryCount: number | null;
};

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

function recommendationFor(item: {
  category: string;
  status: string;
  balanceCents: number;
  duplicateOfId: string | null;
}): string {
  if (item.duplicateOfId || item.status === "dispute") return "Dispute as duplicate — free under FCRA";
  if (item.category === "collection") return "Settle 25-35% with delete language";
  if (item.category === "charge_off") return "Pay-for-delete 30-50%";
  if (item.category === "active") return "Bring current to stop further damage";
  return "Review";
}

export function getCreditTrajectory(): CreditTrajectory {
  const scores = db
    .select()
    .from(schema.creditScores)
    .orderBy(desc(schema.creditScores.date))
    .limit(12)
    .all();

  const moveplan = db
    .select()
    .from(schema.financialPlans)
    .where(eq(schema.financialPlans.type, "move"))
    .get();
  const moveDate = moveplan?.targetDate ?? null;
  const moveDateObj = moveDate ? new Date(moveDate + "T00:00:00") : null;

  if (scores.length === 0) {
    const triage = getCreditTriage();
    const topImpactItems = [...triage.collections, ...triage.chargeOffs]
      .filter((c) => c.status !== "settled" && c.status !== "removed")
      .sort((a, b) => b.balanceCents - a.balanceCents)
      .slice(0, 5)
      .map((c) => ({
        creditor: c.creditor,
        balanceCents: c.balanceCents,
        category: c.category,
        status: c.status,
        recommendation: recommendationFor(c),
      }));

    return {
      hasHistory: false,
      currentScore: null,
      earliestScore: null,
      latestScore: null,
      velocityPerMonth: 0,
      monthsObserved: 0,
      moveDate,
      monthsUntilMove: null,
      pointsTo600: 0,
      pointsTo670: 0,
      requiredVelocityTo600: null,
      requiredVelocityTo670: null,
      paceStatus: "unknown",
      history: [],
      topImpactItems,
      utilizationPct: null,
      utilizationTrend: null,
      derogatoryCount: null,
    };
  }

  // Sort ascending for charting + velocity calc
  const ascending: ScorePoint[] = [...scores]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({ date: s.date, score: s.score, bureau: s.bureau, source: s.source }));

  const earliest = ascending[0];
  const latest = ascending[ascending.length - 1];
  const currentScore = latest.score;

  const earliestDate = new Date(earliest.date + "T00:00:00");
  const latestDate = new Date(latest.date + "T00:00:00");
  const monthsObserved = Math.max(1, monthsBetween(earliestDate, latestDate));
  const velocityPerMonth = (latest.score - earliest.score) / monthsObserved;

  // Pacing toward 600 / 670 by move date
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthsUntilMove = moveDateObj ? Math.max(0, monthsBetween(today, moveDateObj)) : null;
  const pointsTo600 = Math.max(0, 600 - currentScore);
  const pointsTo670 = Math.max(0, 670 - currentScore);
  const requiredVelocityTo600 =
    monthsUntilMove && monthsUntilMove > 0 ? pointsTo600 / monthsUntilMove : null;
  const requiredVelocityTo670 =
    monthsUntilMove && monthsUntilMove > 0 ? pointsTo670 / monthsUntilMove : null;

  let paceStatus: CreditTrajectory["paceStatus"] = "unknown";
  if (currentScore >= 600) {
    paceStatus = "ahead";
  } else if (requiredVelocityTo600 !== null) {
    if (velocityPerMonth >= requiredVelocityTo600 * 1.1) paceStatus = "ahead";
    else if (velocityPerMonth >= requiredVelocityTo600 * 0.9) paceStatus = "on_track";
    else if (velocityPerMonth >= requiredVelocityTo600 * 0.5 || velocityPerMonth >= 3) paceStatus = "behind";
    else paceStatus = "critical";
  }

  // Latest factors
  const factors = db
    .select()
    .from(schema.creditFactors)
    .where(eq(schema.creditFactors.scoreId, scores[0].id))
    .get();
  const utilizationPct =
    factors?.utilizationRatio !== null && factors?.utilizationRatio !== undefined
      ? Math.round(factors.utilizationRatio * 100)
      : null;
  const derogatoryCount = factors?.derogatoryMarks ?? null;

  // Utilization trend: compare to oldest factor on file
  let utilizationTrend: CreditTrajectory["utilizationTrend"] = null;
  if (scores.length >= 2 && utilizationPct !== null) {
    const oldestFactor = db
      .select()
      .from(schema.creditFactors)
      .where(eq(schema.creditFactors.scoreId, scores[scores.length - 1].id))
      .get();
    const oldestUtil =
      oldestFactor?.utilizationRatio !== null && oldestFactor?.utilizationRatio !== undefined
        ? Math.round(oldestFactor.utilizationRatio * 100)
        : null;
    if (oldestUtil !== null) {
      const diff = utilizationPct - oldestUtil;
      utilizationTrend = diff <= -3 ? "improving" : diff >= 3 ? "worsening" : "stable";
    }
  }

  // Top impact items from triage
  const triage = getCreditTriage();
  const topImpactItems = [...triage.collections, ...triage.chargeOffs]
    .filter((c) => c.status !== "settled" && c.status !== "removed")
    .sort((a, b) => {
      // Duplicates first (free wins), then by balance
      const aDup = a.duplicateOfId ? 1 : 0;
      const bDup = b.duplicateOfId ? 1 : 0;
      if (aDup !== bDup) return bDup - aDup;
      return b.balanceCents - a.balanceCents;
    })
    .slice(0, 5)
    .map((c) => ({
      creditor: c.creditor,
      balanceCents: c.balanceCents,
      category: c.category,
      status: c.status,
      recommendation: recommendationFor(c),
    }));

  return {
    hasHistory: true,
    currentScore,
    earliestScore: earliest,
    latestScore: latest,
    velocityPerMonth,
    monthsObserved,
    moveDate,
    monthsUntilMove,
    pointsTo600,
    pointsTo670,
    requiredVelocityTo600,
    requiredVelocityTo670,
    paceStatus,
    history: ascending,
    topImpactItems,
    utilizationPct,
    utilizationTrend,
    derogatoryCount,
  };
}

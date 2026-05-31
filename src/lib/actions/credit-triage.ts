import { db, schema } from "@/lib/db";
import { eq, asc } from "drizzle-orm";
import { newId } from "@/lib/utils/ids";
import { now, parseDollarsToCents } from "@/lib/utils/format";

// ============================================================
// SEED — populates from Experian report (Apr 27, 2026) on first read
// ============================================================

type SeedItem = {
  creditor: string;
  originalCreditor?: string;
  accountLast4?: string;
  category: "active" | "authorized_user" | "charge_off" | "collection";
  status: "pay" | "negotiate" | "settle" | "dispute" | "settled" | "removed" | "ignore";
  balanceDollars: number;
  firstDelinquencyDate?: string; // YYYY-MM
  lastReportedDate?: string; // YYYY-MM-DD
  moveRelevant?: boolean;
  duplicateNote?: string; // human-readable cross-ref; resolved after insert
  notes?: string;
};

// Texas SoL on credit card / written contract debt is 4 years from last
// activity. We approximate from firstDelinquencyDate.
const TEXAS_SOL_YEARS = 4;

// Derogatories fall off 7 years from first delinquency.
const FALL_OFF_YEARS = 7;

function ymToDate(ym?: string): Date | null {
  if (!ym) return null;
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

function addYears(d: Date, years: number): string {
  const out = new Date(d);
  out.setFullYear(out.getFullYear() + years);
  return out.toISOString().slice(0, 10);
}

const SEED: SeedItem[] = [
  // ACTIVE — must pay (5)
  {
    creditor: "Apple Card / GS Bank USA",
    accountLast4: "1100",
    category: "active",
    status: "pay",
    balanceDollars: 2626,
    firstDelinquencyDate: "2026-03",
    lastReportedDate: "2026-03-31",
    notes: "$2,500 limit, 105% utilization. $82 past due as of Mar 2026 — 1 late payment so far. Pay past-due immediately to stop further damage and start utilization recovery.",
  },
  {
    creditor: "Bridgecrest (VW)",
    accountLast4: "200244",
    category: "active",
    status: "pay",
    balanceDollars: 15932,
    firstDelinquencyDate: "2024-04",
    lastReportedDate: "2026-03-31",
    moveRelevant: true,
    notes: "Auto loan. $447/mo, $660 past due, 19 late payments. 60-day-late marks ongoing through 2026 — every additional 60-day → 90-day step is a major score hit. Top priority active account.",
  },
  {
    creditor: "Bridgecrest (Primary)",
    accountLast4: "200235",
    category: "active",
    status: "pay",
    balanceDollars: 28504,
    firstDelinquencyDate: "2024-04",
    lastReportedDate: "2026-03-31",
    moveRelevant: true,
    notes: "Auto loan. $781/mo, 12 late payments, 60-day-late marks ongoing. Single largest active obligation.",
  },
  {
    creditor: "Capital One",
    accountLast4: "5178",
    category: "active",
    status: "pay",
    balanceDollars: 248,
    firstDelinquencyDate: "2024-04",
    lastReportedDate: "2026-03-25",
    notes: "$300 limit, 82% util, $25 min, 11 late payments. Currently 60-day late as of Mar 2026. Cheap to bring current — pay $25-50 immediately.",
  },
  {
    creditor: "LendingPoint LLC",
    accountLast4: "LAI007",
    category: "active",
    status: "negotiate",
    balanceDollars: 15272,
    firstDelinquencyDate: "2023-12",
    lastReportedDate: "2023-12-19",
    notes: "$520/mo, status \"Open/Never late\" — but balance has not updated since Dec 2023. Likely already in default and not yet reported as charge-off. Negotiate reduced payoff before they charge off.",
  },

  // AUTHORIZED USER — leverage, do not remove (2)
  {
    creditor: "Capital One (AU)",
    accountLast4: "4147 — $13k limit",
    category: "authorized_user",
    status: "ignore",
    balanceDollars: 0,
    notes: "Authorized user, never late, opened 7/2014. $13,000 limit. Aged tradeline — keep on report; helps age-of-credit and utilization.",
  },
  {
    creditor: "Capital One (AU)",
    accountLast4: "4147 — $23k limit",
    category: "authorized_user",
    status: "ignore",
    balanceDollars: 0,
    notes: "Authorized user, never late, opened 7/2014. $23,000 limit. Aged tradeline — keep on report.",
  },

  // CHARGE-OFFS — negotiate (9)
  {
    creditor: "WFBNA Card (Wells Fargo)",
    accountLast4: "4426",
    category: "charge_off",
    status: "negotiate",
    balanceDollars: 10375,
    firstDelinquencyDate: "2024-09",
    lastReportedDate: "2026-04-26",
    notes: "Charged off Feb 2025. $10,375 written off — the largest charge-off. Aim 30-40% pay-for-delete; if not, settle for delete-language only.",
  },
  {
    creditor: "Wells Fargo (Note Loan)",
    accountLast4: "6616",
    category: "charge_off",
    status: "negotiate",
    balanceDollars: 4775,
    firstDelinquencyDate: "2024-10",
    lastReportedDate: "2026-03-31",
    notes: "Note loan, $24,000 original. Charged off Jan 2025. $4,775 still being reported. Same lender as WFBNA card — try to bundle.",
  },
  {
    creditor: "DiscoverC",
    accountLast4: "6011",
    category: "charge_off",
    status: "negotiate",
    balanceDollars: 3174,
    firstDelinquencyDate: "2024-09",
    lastReportedDate: "2026-04-22",
    moveRelevant: true,
    notes: "Charged off Apr 2026 — most recent. Discover usually willing to settle with delete around 40-50%.",
  },
  {
    creditor: "Bridgecrest",
    accountLast4: "200019",
    category: "charge_off",
    status: "negotiate",
    balanceDollars: 2146,
    firstDelinquencyDate: "2024-04",
    lastReportedDate: "2026-03-31",
    notes: "Third Bridgecrest debt. $15,089 original auto loan. Charged off Oct 2024. Already negotiable since charge-off is established.",
  },
  {
    creditor: "Credit One Bank NA",
    accountLast4: "3793",
    category: "charge_off",
    status: "dispute",
    balanceDollars: 1795,
    firstDelinquencyDate: "2024-09",
    lastReportedDate: "2025-02-14",
    duplicateNote: "Portfolio Recov Assoc 3793",
    notes: "DUPLICATE: also being reported by Portfolio Recovery as a collection. Dispute one of the two — they cannot both legally show as owed.",
  },
  {
    creditor: "ESB / Harley Davidson Credit",
    accountLast4: "2019",
    category: "charge_off",
    status: "negotiate",
    balanceDollars: 1514,
    firstDelinquencyDate: "2024-03",
    lastReportedDate: "2026-03-31",
    notes: "$9,871 original auto loan. Charged off Jul 2024. Older charge-off — closer to SoL leverage.",
  },
  {
    creditor: "SyncB / Google",
    accountLast4: "6045",
    category: "charge_off",
    status: "negotiate",
    balanceDollars: 1057,
    firstDelinquencyDate: "2024-09",
    lastReportedDate: "2026-03-29",
    notes: "Charge card, $1,190 limit. Charged off Jan 2025. Synchrony will sometimes settle for 30-40%.",
  },
  {
    creditor: "Affirm Inc",
    accountLast4: "4A30",
    category: "charge_off",
    status: "negotiate",
    balanceDollars: 203,
    firstDelinquencyDate: "2025-01",
    lastReportedDate: "2026-04-03",
    notes: "Small. Easy win — pay-for-delete around $80-100.",
  },
  {
    creditor: "Kikoff Lending LLC",
    accountLast4: "CL",
    category: "charge_off",
    status: "negotiate",
    balanceDollars: 140,
    firstDelinquencyDate: "2024-10",
    lastReportedDate: "2025-03-31",
    notes: "Smallest charge-off. Pay in full for delete — under $150.",
  },

  // COLLECTIONS — settle (4)
  {
    creditor: "LVNV Funding LLC",
    originalCreditor: "Happy Money / Cross River Bank",
    accountLast4: "P5E4",
    category: "collection",
    status: "settle",
    balanceDollars: 5674,
    firstDelinquencyDate: "2024-06",
    lastReportedDate: "2026-03-04",
    duplicateNote: "Happy Money Inc charge-off",
    notes: "DUPLICATE EXPOSURE: Happy Money charge-off was sold to Resurgent → LVNV. The original tradeline and this collection both reference the same debt. Settle with LVNV at 25-35% with delete language; ensure original Happy Money line is updated to $0/sold.",
  },
  {
    creditor: "Portfolio Recov Assoc",
    originalCreditor: "Credit One Bank NA",
    accountLast4: "3793",
    category: "collection",
    status: "dispute",
    balanceDollars: 1795,
    firstDelinquencyDate: "2024-09",
    lastReportedDate: "2026-03-25",
    duplicateNote: "Credit One charge-off 3793",
    notes: "DUPLICATE of Credit One charge-off ($1,795 same balance, same account number 3793). Dispute under FCRA — only one party can legally show this debt as owed. If Credit One still reports a balance, the Portfolio entry should be removed (or vice versa).",
  },
  {
    creditor: "Midland Credit Management",
    originalCreditor: "Celtic Bank",
    accountLast4: "3313",
    category: "collection",
    status: "settle",
    balanceDollars: 835,
    firstDelinquencyDate: "2024-07",
    lastReportedDate: "2026-03-27",
    notes: "Celtic Bank originator (commonly Cash App / fintech). Midland will accept ~40% with delete.",
  },
  {
    creditor: "Credit Collection Serv",
    originalCreditor: "Liberty Mutual In. Co.",
    accountLast4: "1385",
    category: "collection",
    status: "settle",
    balanceDollars: 95,
    firstDelinquencyDate: "2024-10",
    lastReportedDate: "2026-04-22",
    moveRelevant: true,
    notes: "Insurance balance — small but visible on rental background checks. Pay in full for delete; cheapest leverage.",
  },
];

function seedIfEmpty(): void {
  const existing = db.select({ id: schema.creditReportItems.id }).from(schema.creditReportItems).limit(1).all();
  if (existing.length > 0) return;

  const timestamp = now();
  // First pass: insert without duplicate links
  const idByDup = new Map<string, string>();
  for (const item of SEED) {
    const id = newId();
    if (item.duplicateNote) idByDup.set(`${item.creditor}-${item.accountLast4 ?? ""}`, id);
    const firstDelinq = ymToDate(item.firstDelinquencyDate);
    const solDate = firstDelinq ? addYears(firstDelinq, TEXAS_SOL_YEARS) : null;
    const fallOffDate = firstDelinq ? addYears(firstDelinq, FALL_OFF_YEARS) : null;

    db.insert(schema.creditReportItems)
      .values({
        id,
        creditor: item.creditor,
        originalCreditor: item.originalCreditor ?? null,
        accountLast4: item.accountLast4 ?? null,
        category: item.category,
        status: item.status,
        balanceCents: parseDollarsToCents(item.balanceDollars),
        settlementOfferCents: null,
        settledAmountCents: null,
        firstDelinquencyDate: item.firstDelinquencyDate ?? null,
        lastReportedDate: item.lastReportedDate ?? null,
        solDate,
        fallOffDate,
        moveRelevant: item.moveRelevant ?? false,
        duplicateOfId: null,
        notes: item.notes ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
  }

  // Second pass: wire duplicate links so the duplicate-of-each-other pairs
  // know about each other. Match by accountLast4 — both items in a duplicate
  // pair share the same last4.
  const all = db.select().from(schema.creditReportItems).all();
  const byLast4 = new Map<string, typeof all>();
  for (const row of all) {
    if (!row.accountLast4) continue;
    const list = byLast4.get(row.accountLast4) ?? [];
    list.push(row);
    byLast4.set(row.accountLast4, list);
  }
  for (const [last4, rows] of byLast4) {
    if (rows.length < 2) continue;
    // Only treat as duplicate when at least one side carries the dispute/duplicate hint
    const hasDup = rows.some((r) => r.notes?.toLowerCase().includes("duplicate"));
    if (!hasDup) continue;
    // Cross-link: each row points to the other (just pick the first as canonical)
    const canonical = rows.find((r) => r.category === "charge_off") ?? rows[0];
    for (const r of rows) {
      if (r.id === canonical.id) continue;
      db.update(schema.creditReportItems)
        .set({ duplicateOfId: canonical.id, updatedAt: timestamp })
        .where(eq(schema.creditReportItems.id, r.id))
        .run();
    }
    void last4;
  }

  // Default settlement budget if not set
  const budget = db.select().from(schema.creditSettlementBudget).limit(1).all();
  if (budget.length === 0) {
    db.insert(schema.creditSettlementBudget)
      .values({
        id: newId(),
        budgetCents: 600000, // $6,000 default — middle of user's $5-8k stated range
        notes: null,
        updatedAt: timestamp,
      })
      .run();
  }
}

// ============================================================
// READ
// ============================================================

export type CreditTriageItem = {
  id: string;
  creditor: string;
  originalCreditor: string | null;
  accountLast4: string | null;
  category: "active" | "authorized_user" | "charge_off" | "collection";
  status: "pay" | "negotiate" | "settle" | "dispute" | "settled" | "removed" | "ignore";
  balanceCents: number;
  settlementOfferCents: number | null;
  settledAmountCents: number | null;
  firstDelinquencyDate: string | null;
  lastReportedDate: string | null;
  solDate: string | null;
  fallOffDate: string | null;
  moveRelevant: boolean;
  duplicateOfId: string | null;
  notes: string | null;
};

export type CreditTriageSummary = {
  // Totals
  activeBalance: number; // cents
  chargeOffBalance: number;
  collectionBalance: number;
  totalDamage: number; // sum of charge-offs + collections (active is debt, not "damage")
  duplicateExposure: number; // sum of items marked dispute that overlap with another item
  // Resolution
  settlementBudgetCents: number;
  totalOffered: number; // sum of settlement_offer for items not yet settled
  totalSettled: number; // sum of settled_amount where status = settled or removed
  remainingBudget: number; // budget - totalSettled
  // Counts
  countByStatus: Record<string, number>;
  countByCategory: Record<string, number>;
  itemsResolvedCount: number;
  itemsTotalCount: number;
};

export type CreditTriage = {
  active: CreditTriageItem[];
  authorizedUser: CreditTriageItem[];
  chargeOffs: CreditTriageItem[];
  collections: CreditTriageItem[];
  summary: CreditTriageSummary;
};

function rowToItem(row: typeof schema.creditReportItems.$inferSelect): CreditTriageItem {
  return {
    id: row.id,
    creditor: row.creditor,
    originalCreditor: row.originalCreditor,
    accountLast4: row.accountLast4,
    category: row.category as CreditTriageItem["category"],
    status: row.status as CreditTriageItem["status"],
    balanceCents: row.balanceCents,
    settlementOfferCents: row.settlementOfferCents,
    settledAmountCents: row.settledAmountCents,
    firstDelinquencyDate: row.firstDelinquencyDate,
    lastReportedDate: row.lastReportedDate,
    solDate: row.solDate,
    fallOffDate: row.fallOffDate,
    moveRelevant: row.moveRelevant,
    duplicateOfId: row.duplicateOfId,
    notes: row.notes,
  };
}

export function getCreditTriage(): CreditTriage {
  seedIfEmpty();

  const rows = db
    .select()
    .from(schema.creditReportItems)
    .orderBy(asc(schema.creditReportItems.balanceCents))
    .all()
    .map(rowToItem);

  const active = rows.filter((r) => r.category === "active").sort((a, b) => b.balanceCents - a.balanceCents);
  const authorizedUser = rows.filter((r) => r.category === "authorized_user");
  const chargeOffs = rows.filter((r) => r.category === "charge_off").sort((a, b) => b.balanceCents - a.balanceCents);
  const collections = rows.filter((r) => r.category === "collection").sort((a, b) => b.balanceCents - a.balanceCents);

  const sumBalance = (items: CreditTriageItem[]) => items.reduce((s, r) => s + r.balanceCents, 0);

  const activeBalance = sumBalance(active);
  const chargeOffBalance = sumBalance(chargeOffs);
  const collectionBalance = sumBalance(collections);

  // Duplicate exposure: when an item is duplicateOf another, only count once
  // toward "damage". We sum charge-offs + collections, then subtract the
  // smaller of any pair flagged as duplicate.
  const idMap = new Map<string, CreditTriageItem>(rows.map((r) => [r.id, r]));
  let duplicateOverlap = 0;
  for (const r of rows) {
    if (!r.duplicateOfId) continue;
    const other = idMap.get(r.duplicateOfId);
    if (!other) continue;
    duplicateOverlap += Math.min(r.balanceCents, other.balanceCents);
  }

  const totalDamageRaw = chargeOffBalance + collectionBalance;
  const totalDamage = totalDamageRaw - duplicateOverlap;

  const settlementBudgetRow = db.select().from(schema.creditSettlementBudget).limit(1).all()[0];
  const settlementBudgetCents = settlementBudgetRow?.budgetCents ?? 0;

  const totalOffered = rows
    .filter((r) => r.status !== "settled" && r.status !== "removed" && r.settlementOfferCents)
    .reduce((s, r) => s + (r.settlementOfferCents ?? 0), 0);

  const totalSettled = rows
    .filter((r) => (r.status === "settled" || r.status === "removed") && r.settledAmountCents)
    .reduce((s, r) => s + (r.settledAmountCents ?? 0), 0);

  const remainingBudget = settlementBudgetCents - totalSettled;

  const countByStatus: Record<string, number> = {};
  const countByCategory: Record<string, number> = {};
  for (const r of rows) {
    countByStatus[r.status] = (countByStatus[r.status] ?? 0) + 1;
    countByCategory[r.category] = (countByCategory[r.category] ?? 0) + 1;
  }
  const itemsResolvedCount = (countByStatus["settled"] ?? 0) + (countByStatus["removed"] ?? 0);
  const itemsTotalCount = rows.length;

  return {
    active,
    authorizedUser,
    chargeOffs,
    collections,
    summary: {
      activeBalance,
      chargeOffBalance,
      collectionBalance,
      totalDamage,
      duplicateExposure: duplicateOverlap,
      settlementBudgetCents,
      totalOffered,
      totalSettled,
      remainingBudget,
      countByStatus,
      countByCategory,
      itemsResolvedCount,
      itemsTotalCount,
    },
  };
}

// ============================================================
// MUTATIONS
// ============================================================

export type CreateCreditItemInput = {
  creditor: string;
  originalCreditor?: string;
  accountLast4?: string;
  category: "active" | "authorized_user" | "charge_off" | "collection";
  status?: "pay" | "negotiate" | "settle" | "dispute" | "settled" | "removed" | "ignore";
  balanceDollars: number;
  firstDelinquencyDate?: string; // YYYY-MM
  lastReportedDate?: string;
  moveRelevant?: boolean;
  notes?: string;
};

export type CreateResult = { success: true; id: string } | { success: false; error: string };

export function createCreditItem(input: CreateCreditItemInput): CreateResult {
  if (!input.creditor?.trim()) return { success: false, error: "creditor is required" };
  if (!Number.isFinite(input.balanceDollars) || input.balanceDollars < 0) {
    return { success: false, error: "balanceDollars must be zero or positive" };
  }
  const id = newId();
  const timestamp = now();
  const firstDelinq = ymToDate(input.firstDelinquencyDate);
  const solDate = firstDelinq ? addYears(firstDelinq, TEXAS_SOL_YEARS) : null;
  const fallOffDate = firstDelinq ? addYears(firstDelinq, FALL_OFF_YEARS) : null;

  db.insert(schema.creditReportItems)
    .values({
      id,
      creditor: input.creditor.trim(),
      originalCreditor: input.originalCreditor?.trim() || null,
      accountLast4: input.accountLast4?.trim() || null,
      category: input.category,
      status: input.status ?? "negotiate",
      balanceCents: parseDollarsToCents(input.balanceDollars),
      settlementOfferCents: null,
      settledAmountCents: null,
      firstDelinquencyDate: input.firstDelinquencyDate ?? null,
      lastReportedDate: input.lastReportedDate ?? null,
      solDate,
      fallOffDate,
      moveRelevant: input.moveRelevant ?? false,
      duplicateOfId: null,
      notes: input.notes?.trim() || null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();
  return { success: true, id };
}

export type UpdateCreditItemInput = {
  creditor?: string;
  originalCreditor?: string | null;
  accountLast4?: string | null;
  category?: "active" | "authorized_user" | "charge_off" | "collection";
  status?: "pay" | "negotiate" | "settle" | "dispute" | "settled" | "removed" | "ignore";
  balanceDollars?: number;
  settlementOfferDollars?: number | null;
  settledAmountDollars?: number | null;
  firstDelinquencyDate?: string | null;
  lastReportedDate?: string | null;
  moveRelevant?: boolean;
  notes?: string | null;
};

export type UpdateResult = { success: true } | { success: false; error: string };

export function updateCreditItem(id: string, input: UpdateCreditItemInput): UpdateResult {
  if (!id) return { success: false, error: "id is required" };
  const existing = db
    .select()
    .from(schema.creditReportItems)
    .where(eq(schema.creditReportItems.id, id))
    .get();
  if (!existing) return { success: false, error: `Credit item ${id} not found` };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = { updatedAt: now() };

  if (input.creditor !== undefined) {
    if (!input.creditor.trim()) return { success: false, error: "creditor cannot be blank" };
    updates.creditor = input.creditor.trim();
  }
  if (input.originalCreditor !== undefined) {
    updates.originalCreditor = input.originalCreditor?.trim() || null;
  }
  if (input.accountLast4 !== undefined) {
    updates.accountLast4 = input.accountLast4?.trim() || null;
  }
  if (input.category !== undefined) updates.category = input.category;
  if (input.status !== undefined) updates.status = input.status;
  if (input.balanceDollars !== undefined) {
    if (!Number.isFinite(input.balanceDollars) || input.balanceDollars < 0) {
      return { success: false, error: "balanceDollars must be zero or positive" };
    }
    updates.balanceCents = parseDollarsToCents(input.balanceDollars);
  }
  if (input.settlementOfferDollars !== undefined) {
    updates.settlementOfferCents =
      input.settlementOfferDollars !== null ? parseDollarsToCents(input.settlementOfferDollars) : null;
  }
  if (input.settledAmountDollars !== undefined) {
    updates.settledAmountCents =
      input.settledAmountDollars !== null ? parseDollarsToCents(input.settledAmountDollars) : null;
  }
  if (input.firstDelinquencyDate !== undefined) {
    updates.firstDelinquencyDate = input.firstDelinquencyDate;
    const d = ymToDate(input.firstDelinquencyDate ?? undefined);
    updates.solDate = d ? addYears(d, TEXAS_SOL_YEARS) : null;
    updates.fallOffDate = d ? addYears(d, FALL_OFF_YEARS) : null;
  }
  if (input.lastReportedDate !== undefined) updates.lastReportedDate = input.lastReportedDate;
  if (input.moveRelevant !== undefined) updates.moveRelevant = input.moveRelevant;
  if (input.notes !== undefined) updates.notes = input.notes?.trim() || null;

  db.update(schema.creditReportItems).set(updates).where(eq(schema.creditReportItems.id, id)).run();
  return { success: true };
}

export type DeleteResult = { success: true } | { success: false; error: string };

export function deleteCreditItem(id: string): DeleteResult {
  if (!id) return { success: false, error: "id is required" };
  const existing = db.select().from(schema.creditReportItems).where(eq(schema.creditReportItems.id, id)).get();
  if (!existing) return { success: false, error: `Credit item ${id} not found` };

  // Clear any inbound duplicate links pointing at this row before deleting it.
  db.update(schema.creditReportItems)
    .set({ duplicateOfId: null, updatedAt: now() })
    .where(eq(schema.creditReportItems.duplicateOfId, id))
    .run();

  db.delete(schema.creditReportItems).where(eq(schema.creditReportItems.id, id)).run();
  return { success: true };
}

// ============================================================
// SETTLEMENT BUDGET
// ============================================================

export function setSettlementBudget(dollars: number, notes?: string): UpdateResult {
  if (!Number.isFinite(dollars) || dollars < 0) return { success: false, error: "budget must be zero or positive" };
  const cents = parseDollarsToCents(dollars);
  const timestamp = now();
  const existing = db.select().from(schema.creditSettlementBudget).limit(1).all()[0];
  if (existing) {
    db.update(schema.creditSettlementBudget)
      .set({ budgetCents: cents, notes: notes?.trim() || null, updatedAt: timestamp })
      .where(eq(schema.creditSettlementBudget.id, existing.id))
      .run();
  } else {
    db.insert(schema.creditSettlementBudget)
      .values({ id: newId(), budgetCents: cents, notes: notes?.trim() || null, updatedAt: timestamp })
      .run();
  }
  return { success: true };
}

// ============================================================
// SCORE PROJECTION (heuristic)
// ============================================================

export type ScoreProjection = {
  currentScore: number;
  // Each lever is a category of work that produces an estimated score gain
  levers: Array<{
    label: string;
    projectedGain: number; // points
    rationale: string;
    blocked?: string; // if there's a prerequisite
  }>;
  ceilingScore: number; // current + sum of all gains
  goalScore: 600 | 670;
  pathToGoal: string; // human-readable next-step ranking
};

/**
 * Heuristic score projection. The exact gains are statistical estimates
 * widely cited in credit-rebuild communities — they're directional, not
 * exact. The point is to sequence work, not predict the score to the digit.
 */
export function getScoreProjection(currentScore: number, triage: CreditTriage): ScoreProjection {
  const levers: ScoreProjection["levers"] = [];
  const { collections, chargeOffs, summary } = triage;

  const unresolvedCollections = collections.filter((c) => c.status !== "settled" && c.status !== "removed");
  const unresolvedChargeOffs = chargeOffs.filter((c) => c.status !== "settled" && c.status !== "removed");

  // Lever 1: clear duplicates first — free wins, no money required
  const duplicates = [...collections, ...chargeOffs].filter((c) => c.duplicateOfId !== null || c.status === "dispute");
  if (duplicates.length > 0) {
    levers.push({
      label: `Dispute ${duplicates.length} duplicate${duplicates.length > 1 ? "s" : ""}`,
      projectedGain: 15 * Math.min(duplicates.length, 3),
      rationale: "Duplicates count as separate derogatories. Removal is free under FCRA.",
    });
  }

  // Lever 2: bring active accounts current (stop the bleeding)
  const lateActive = triage.active.filter((a) => {
    return a.notes?.includes("past due") || a.notes?.includes("60-day") || a.notes?.includes("late");
  });
  if (lateActive.length > 0) {
    levers.push({
      label: "Bring active accounts current",
      projectedGain: 25,
      rationale: "Stops further 30/60/90-day-late marks. Each new late mark is ~10-30 points lost.",
    });
  }

  // Lever 3: utilization to <30%, then <10%
  if (triage.active.some((a) => a.notes?.includes("utilization") || a.notes?.includes("util"))) {
    levers.push({
      label: "Utilization → under 30%",
      projectedGain: 30,
      rationale: "Apple Card alone at 105% util is dragging both base and bankcard scores hard.",
    });
    levers.push({
      label: "Utilization → under 10%",
      projectedGain: 20,
      rationale: "Stacks on the under-30% lever once the first threshold is cleared.",
      blocked: "after under-30%",
    });
  }

  // Lever 4: settle collections with delete language
  if (unresolvedCollections.length > 0) {
    levers.push({
      label: `Settle ${unresolvedCollections.length} collection${unresolvedCollections.length > 1 ? "s" : ""} with delete`,
      projectedGain: 10 * unresolvedCollections.length,
      rationale: "FICO 9/10 ignore paid collections; pay-for-delete also helps older models.",
    });
  }

  // Lever 5: pay-for-delete charge-offs (newer scoring models)
  if (unresolvedChargeOffs.length > 0) {
    levers.push({
      label: `Pay-for-delete ${unresolvedChargeOffs.length} charge-off${unresolvedChargeOffs.length > 1 ? "s" : ""}`,
      projectedGain: 8 * unresolvedChargeOffs.length,
      rationale: "Some lenders agree to delete; even if not, paid charge-offs hurt less than unpaid in newer FICO models.",
    });
  }

  // Lever 6: time / fall-off (passive)
  levers.push({
    label: "Time + on-time payments (passive)",
    projectedGain: 30,
    rationale: "Consistent on-time payments and aging derogatories add ~3-5 pts/month over 6-12 months.",
    blocked: "passive over 6-12 mo",
  });

  const totalGain = levers.reduce((s, l) => s + l.projectedGain, 0);
  const ceilingScore = Math.min(850, currentScore + totalGain);
  const goalScore: 600 | 670 = ceilingScore >= 670 ? 670 : 600;

  // Path: rank by gain/effort. Free disputes first, then current, then util, then settlements.
  const pathToGoal = [
    duplicates.length > 0 ? `Dispute duplicates (free, ~${duplicates.length * 15} pts)` : null,
    lateActive.length > 0 ? "Bring active accounts current (~$300 outlay, ~25 pts)" : null,
    "Utilization to <30% — Apple Card past-due first (~$300, ~30 pts)",
    `Settle ${unresolvedCollections.length} collection${unresolvedCollections.length > 1 ? "s" : ""} with delete language (~$3-4k)`,
    `Pay-for-delete top 3 charge-offs by leverage (~$3-5k)`,
  ]
    .filter(Boolean)
    .join(" → ");

  void summary;

  return { currentScore, levers, ceilingScore, goalScore, pathToGoal };
}

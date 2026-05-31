import { db, schema } from "@/lib/db";
import { eq, asc } from "drizzle-orm";
import { newId } from "@/lib/utils/ids";
import { now } from "@/lib/utils/format";

export type ActionPlanStatus = "pending" | "in_progress" | "completed" | "skipped";
export type ActionPlanPhase = "now" | "this_week" | "this_month" | "ongoing";

export type ActionPlanItem = {
  id: string;
  title: string;
  description: string | null;
  phase: ActionPlanPhase;
  status: ActionPlanStatus;
  estimatedSavingsCents: number | null;
  link: string | null;
  notes: string | null;
  sortOrder: number;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export function getActionPlanItems(): ActionPlanItem[] {
  return db
    .select()
    .from(schema.actionPlanItems)
    .orderBy(asc(schema.actionPlanItems.sortOrder), asc(schema.actionPlanItems.createdAt))
    .all() as ActionPlanItem[];
}

export function createActionPlanItem(input: {
  title: string;
  description?: string;
  phase?: ActionPlanPhase;
  estimatedSavingsCents?: number;
  link?: string;
  dueAt?: string;
  sortOrder?: number;
}): string {
  const id = newId();
  db.insert(schema.actionPlanItems).values({
    id,
    title: input.title,
    description: input.description ?? null,
    phase: input.phase ?? "now",
    status: "pending",
    estimatedSavingsCents: input.estimatedSavingsCents ?? null,
    link: input.link ?? null,
    notes: null,
    sortOrder: input.sortOrder ?? 0,
    dueAt: input.dueAt ?? null,
    completedAt: null,
    createdAt: now(),
  }).run();
  return id;
}

export function updateActionPlanItem(id: string, patch: Partial<{
  status: ActionPlanStatus;
  notes: string;
  title: string;
  description: string;
  phase: ActionPlanPhase;
  estimatedSavingsCents: number | null;
  dueAt: string | null;
}>) {
  const update: Record<string, unknown> = {};
  if (patch.status !== undefined) {
    update.status = patch.status;
    if (patch.status === "completed") update.completedAt = now();
    else if (patch.status === "pending" || patch.status === "in_progress") update.completedAt = null;
  }
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.phase !== undefined) update.phase = patch.phase;
  if (patch.estimatedSavingsCents !== undefined) update.estimatedSavingsCents = patch.estimatedSavingsCents;
  if (patch.dueAt !== undefined) update.dueAt = patch.dueAt;
  db.update(schema.actionPlanItems).set(update).where(eq(schema.actionPlanItems.id, id)).run();
}

export function deleteActionPlanItem(id: string) {
  db.delete(schema.actionPlanItems).where(eq(schema.actionPlanItems.id, id)).run();
}

/** Seed the cash-flow plan if no items exist yet. Idempotent: skips if any
 *  rows are already present so we don't duplicate on every page load. */
export function seedCashFlowPlanIfEmpty(): boolean {
  const existing = db.select({ id: schema.actionPlanItems.id }).from(schema.actionPlanItems).limit(1).all();
  if (existing.length > 0) return false;

  const items: Array<{ title: string; description: string; phase: ActionPlanPhase; estimatedSavingsCents?: number; link?: string; sortOrder: number }> = [
    // === NOW (this weekend) ===
    {
      title: "Set auto-pay on all 5 active debts",
      description: "Bridgecrest Primary, Bridgecrest VW, Apple Card, LendingPoint, Capital One. Kills the $226/mo late-fees bleed permanently. Use the Auto-pay Checklist on /debts to track each.",
      phase: "now",
      estimatedSavingsCents: 22600,
      link: "/debts",
      sortOrder: 10,
    },
    {
      title: "Hard freeze on MyPay advances",
      description: "No advances for 4 weeks. Open the MyPay app, set max to $0 or commit no-touch. Each advance keeps the borrow-from-future cycle alive (~$10-15/mo in fees).",
      phase: "now",
      estimatedSavingsCents: 1500,
      sortOrder: 20,
    },
    {
      title: "Cancel OpenAI subscription",
      description: "Direct billing on chatgpt.com → Settings → Subscription. Phone on the charge: 415-879-9686.",
      phase: "now",
      estimatedSavingsCents: 4400,
      sortOrder: 30,
    },
    {
      title: "Cancel Hulu (subscribe to Disney+ standalone)",
      description: "hulu.com → Account → Cancel Subscription. Then disneyplus.com to subscribe to Disney+ standalone ($9.99/mo).",
      phase: "now",
      estimatedSavingsCents: 2700,
      sortOrder: 40,
    },
    {
      title: "Mark OpenArt AI cancelled (already on kill list)",
      description: "Cancel in OpenArt account, then click 'Mark cancelled' in /reports → Subscriptions kill list.",
      phase: "now",
      estimatedSavingsCents: 2900,
      link: "/reports",
      sortOrder: 50,
    },
    {
      title: "Mark Atlassian cancelled (already on kill list)",
      description: "Cancel via Atlassian admin, mark cancelled in /reports → Subscriptions.",
      phase: "now",
      estimatedSavingsCents: 1800,
      link: "/reports",
      sortOrder: 60,
    },

    // === THIS WEEK ===
    {
      title: "Call AT&T retention for $50-100/mo discount",
      description: "Already shifted bill to 30th. Now call retention at 800-331-0500. Mention switching to T-Mobile/Verizon. Realistic target: $50/mo permanent reduction.",
      phase: "this_week",
      estimatedSavingsCents: 5000,
      sortOrder: 70,
    },
    {
      title: "Set up auto-transfer: $250 every Friday → 360 Performance Savings",
      description: "Build the $1,500 buffer. 4 transfers × $250 = $1,000. Combined with current $963 puts buffer at $1,963 (above target). Capital One app → Move money → Set recurring.",
      phase: "this_week",
      sortOrder: 80,
    },
    {
      title: "Downgrade Proton to Mail Plus ($4.99/mo)",
      description: "Keep proton.me email + custom domains, drop unused features. account.proton.me → Subscription. Saves $46/mo, no migration work.",
      phase: "this_week",
      estimatedSavingsCents: 4600,
      sortOrder: 90,
    },

    // === THIS MONTH ===
    {
      title: "Resolve smallest collection (credit cleanup)",
      description: "Pick the lowest-balance collection on /credit. Try pay-for-delete with $200-500. Single biggest credit-score lever right now (519 → 600+ requires settling derogatories).",
      phase: "this_month",
      link: "/credit",
      sortOrder: 100,
    },
    {
      title: "Probe one specific side income source",
      description: "$500/mo side income cuts the Houston timeline in half AND opens room for extra debt principal. Specific commitment: bid 3 freelance jobs OR ask current client about Y by [date].",
      phase: "this_month",
      sortOrder: 110,
    },

    // === ONGOING ===
    {
      title: "Hold Restaurants under $450/mo (was $200, blowing it)",
      description: "Daily pace: $14.50/day. Weekly check-in via /budget Action Queue. Already merged Dining + Fast Food into this single budget.",
      phase: "ongoing",
      sortOrder: 120,
    },
    {
      title: "Once cash recovers: bump Bridgecrest VW to $547/mo total",
      description: "Currently splitting at $497/mo (extra $50 principal). Once cuts land (~$300/mo recovered from subs), bump split to $273.50 each = $547/mo total. Saves $1,610 in interest, shaves 11 months off VW loan.",
      phase: "ongoing",
      estimatedSavingsCents: 100,
      link: "/debts",
      sortOrder: 130,
    },
  ];

  for (const item of items) {
    createActionPlanItem(item);
  }
  return true;
}

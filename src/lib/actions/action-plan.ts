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

const HOUSEHOLD_TASKS_FLAG = "household_plan_tasks_seeded";

/**
 * Seed the open questions and to-dos from the 25 Oct 2026 household plan
 * ("April and AJ's Financial Plan v1"). Runs once, tracked by a settings flag
 * rather than an empty table, because the cash-flow plan is already there.
 */
export function seedHouseholdPlanTasksOnce(): boolean {
  const flag = db
    .select({ key: schema.settings.key })
    .from(schema.settings)
    .where(eq(schema.settings.key, HOUSEHOLD_TASKS_FLAG))
    .get();
  if (flag) return false;

  const items: Array<{ title: string; description: string; phase: ActionPlanPhase; estimatedSavingsCents?: number; link?: string; dueAt?: string; sortOrder: number }> = [
    // === THIS WEEK ===
    {
      title: "Ask Navusoft whether they offer a dependent care FSA",
      description: "The 2026 limit is $7,500 and Elijah's daycare is $7,488 a year. Pre-tax and pre-FICA it's worth about $2,220, against roughly $850–$1,050 from the childcare credit. Open enrollment is the window.",
      phase: "this_week",
      link: "/tax",
      sortOrder: 200,
    },
    {
      title: "Fix the W-4: married filing jointly, 3 children",
      description: "Step 1(c) married filing jointly · Step 2(c) unchecked (April is self-employed) · Step 3 $6,600 for three children · Step 4(c) whatever you pick together on /tax · work state Texas. Don't under-withhold — owing at filing defaults the installment agreement.",
      phase: "this_week",
      link: "/tax",
      sortOrder: 210,
    },
    {
      title: "Pay the tithe by transfer or check, or get a church year-end statement",
      description: "Cash with no bank record or church statement is never deductible. From 2026 up to $2,000 joint is deductible without itemising — about $440. Any single gift of $250+ also needs a written acknowledgment.",
      phase: "this_week",
      link: "/tax",
      sortOrder: 220,
    },
    {
      title: "Requote auto insurance with April as the primary insured",
      description: "Insurance is priced partly on credit and April's score is materially higher. Free to find out; estimated at around $70 a month.",
      phase: "this_week",
      estimatedSavingsCents: 7000,
      sortOrder: 230,
    },
    {
      title: "End the AT&T / Verizon overlap",
      description: "$533.49 a month on phones while both run. Dropping AT&T ($343.98) is the single biggest cut left in the household budget. Check for device promo credits before paying anything off.",
      phase: "this_week",
      estimatedSavingsCents: 34398,
      link: "/budget",
      sortOrder: 240,
    },
    {
      title: "Confirm Kinsta and Pantheon end after November",
      description: "Both budget lines are marked to end after November: Kinsta $124 and Pantheon $55 a month, charged to personal accounts for a company that closed on 27 October. Check that both are cancelled, or moved to Simon, before December's charges.",
      phase: "this_week",
      estimatedSavingsCents: 17900,
      sortOrder: 250,
    },
    {
      title: "Ask Meridian's drafter: capital interest or profits interest? Any 83(b)?",
      description: "Attachment A calls the sweat equity an \"Initial Contribution\" against a fixed 35% — that points at a capital interest, which can mean ordinary income in 2026. Ask for the opening capital account balances, whether it was meant as a Rev. Proc. 93-27 profits interest, and whether an 83(b) was ever mailed (~March 2026).",
      phase: "this_week",
      link: "/plan/meridian",
      sortOrder: 260,
    },

    // === THIS MONTH ===
    {
      title: "Dissolve Meridian properly",
      description: "Meridian paid its final draw on 27 October. Read what the Operating Agreement says about dissolution and who must consent, pay the final bills, and file the Georgia paperwork that ends the LLC. Whatever is left goes out as the agreement directs.",
      phase: "this_month",
      link: "/plan/meridian",
      sortOrder: 300,
    },
    {
      title: "Get his capital account detail / outside basis from Meridian's books",
      description: "Opening balance, contributions, guaranteed payments and allocated loss to date. Decides whether the ~$43,578 loss share is usable in 2026 or carries forward. Expected answer: near zero.",
      phase: "this_month",
      link: "/plan/meridian",
      sortOrder: 330,
    },
    {
      title: "Engage a preparer for Meridian's final Form 1065",
      description: "A partnership's return is due the 15th day of the third month after its tax year ends, and a closing company's year ends when it finishes winding up, so the final 1065 and K-1s are likely due in January or February 2027, not 15 March. Confirm the date with the preparer. The personal return can't be finished without the K-1, and a late 1065 is penalised per partner per month.",
      phase: "this_month",
      link: "/plan/meridian",
      sortOrder: 340,
    },
    {
      title: "Cover self-employment tax on the guaranteed payments",
      description: "Nothing was withheld from the Meridian draws, which ended on 27 October. /tax works out what is owed. Extra W-4 withholding or a Q4 estimated payment (due 15 Jan 2027).",
      phase: "this_month",
      link: "/tax",
      dueAt: "2027-01-15",
      sortOrder: 350,
    },
    {
      title: "Book an hour with a tax professional",
      description: "Capital vs profits interest, partnership basis, injured spouse (Form 8379) under Texas community property, and the Georgia part-year return. Bring the agreements and the /tax numbers.",
      phase: "this_month",
      link: "/tax",
      sortOrder: 360,
    },
    {
      title: "Get car values against payoff quotes (Maverick, Tiguan)",
      description: "Two calls and two valuations. Without them the car options are guesswork.",
      phase: "this_month",
      link: "/plan/cars",
      sortOrder: 370,
    },
    {
      title: "Confirm Seth has taken over the Tiguan, then zero its budget line",
      description: "$447 a month and the 24% note come off the household from November.",
      phase: "this_month",
      estimatedSavingsCents: 44700,
      link: "/budget",
      sortOrder: 380,
    },

    // === ONGOING ===
    {
      title: "Get Harvard Extension's 2026 Form 1098-T and total what was paid",
      description: "Lifetime Learning Credit: 20% of up to $10,000. Count what was paid in calendar 2026, not billed. Phases out between $160k and $180k joint AGI. Enter it on /tax.",
      phase: "ongoing",
      link: "/tax",
      dueAt: "2027-01-31",
      sortOrder: 400,
    },
    {
      title: "Gather Meridian's records through 27 October for the final return",
      description: "The preparer needs the year's charges and draws up to the close. Every software charge is already on the card statements, so this is mostly assembling what exists. Keep Navusoft expenses separate.",
      phase: "ongoing",
      sortOrder: 410,
    },
  ];

  db.transaction(() => {
    for (const item of items) createActionPlanItem(item);
    db.insert(schema.settings)
      .values({ key: HOUSEHOLD_TASKS_FLAG, value: JSON.stringify(now()), updatedAt: now() })
      .run();
  });
  return true;
}

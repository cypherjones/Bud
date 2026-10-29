import { db, schema } from "@/lib/db";
import { eq, asc } from "drizzle-orm";
import { newId } from "@/lib/utils/ids";
import { now, parseDollarsToCents } from "@/lib/utils/format";
import type { HouseholdLine, LineOwner } from "./calc";

export function getHouseholdLines(): HouseholdLine[] {
  return db
    .select()
    .from(schema.householdLines)
    .orderBy(asc(schema.householdLines.sortOrder), asc(schema.householdLines.createdAt))
    .all() as HouseholdLine[];
}

export function updateHouseholdLine(
  id: string,
  patch: Partial<{ amount: number; owner: LineOwner; label: string; note: string | null; categoryId: string | null }>,
) {
  const update: Record<string, unknown> = { updatedAt: now() };
  if (patch.amount !== undefined) update.amount = parseDollarsToCents(patch.amount);
  if (patch.owner !== undefined) update.owner = patch.owner;
  if (patch.label !== undefined) update.label = patch.label;
  if (patch.note !== undefined) update.note = patch.note;
  if (patch.categoryId !== undefined) update.categoryId = patch.categoryId;
  db.update(schema.householdLines).set(update).where(eq(schema.householdLines.id, id)).run();
}

export function createHouseholdLine(input: {
  groupName: string;
  label: string;
  amount: number; // dollars
  owner: LineOwner;
  note?: string;
  categoryId?: string | null;
}): string {
  const id = newId();
  const last = getHouseholdLines()
    .filter((l) => l.groupName === input.groupName)
    .reduce((m, l) => Math.max(m, l.sortOrder), 0);
  const timestamp = now();
  db.insert(schema.householdLines)
    .values({
      id,
      slug: null,
      groupName: input.groupName,
      label: input.label,
      note: input.note ?? null,
      amount: parseDollarsToCents(input.amount),
      owner: input.owner,
      categoryId: input.categoryId ?? null,
      // Unknown group → sorts to the end
      sortOrder: last > 0 ? last + 1 : 9000,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();
  return id;
}

export function deleteHouseholdLine(id: string) {
  db.delete(schema.householdLines).where(eq(schema.householdLines.id, id)).run();
}

/**
 * Seed the shared budget from the 25 Oct 2026 plan ("April and AJ's Financial
 * Plan v1"), updated to 29 Oct 2026. Idempotent — only runs while the table is
 * empty. The owners are starting points, meant to be argued with. Balances
 * live on Debts and the card page, not in these notes.
 */
export function seedHouseholdLinesIfEmpty(): boolean {
  const existing = db.select({ id: schema.householdLines.id }).from(schema.householdLines).limit(1).all();
  if (existing.length > 0) return false;

  type Seed = [slug: string | null, label: string, amount: number, owner: LineOwner, note: string];
  const SEED: Array<[group: string, lines: Seed[]]> = [
    ["Giving", [
      ["tithe", "Tithe", 0, "both", "Calculated from the income above"],
    ]],
    ["Housing", [
      [null, "Rent — 100 Harbour Town Dr", 2600, "both", "Paid at month end for the month ahead"],
      [null, "Electric — Entergy", 307, "both", "Projected from the first bill: 65 kWh a day at $0.1436 all-in"],
      [null, "Water and sewer — Hays / MUD", 85, "both", "$14 water minimum plus $50 flat sewer, plus usage above 4,000 gallons"],
      [null, "Gas", 75, "both", "Estimate, no bill yet"],
      [null, "Internet", 95, "both", ""],
      [null, "Renters insurance", 35, "both", ""],
    ]],
    ["Children", [
      [null, "Neriah — school", 416.67, "both", "Confirmed. Was carried at $500."],
      [null, "Daycare — Elijah", 624, "both", "$156 a week. Qualifies for the child and dependent care credit now that April has earned income."],
      [null, "Clothes, sports, activities", 150, "both", "Accrues; spent per season"],
    ]],
    ["Transportation", [
      [null, "Auto loan — Maverick", 781, "his", "Bridgecrest. Balance on the Debts page."],
      [null, "Auto loan — Tiguan", 447, "his", "Seth takes this over from November. Set it to 0 once that is confirmed."],
      [null, "Auto insurance — Geico", 320, "his", "AJ only. April's $142.52 policy was cancelled."],
      [null, "Fuel", 408, "both", ""],
      [null, "Maintenance fund", 100, "both", "Accrues"],
      [null, "Tolls", 50, "both", ""],
    ]],
    ["Food and daily", [
      [null, "Groceries", 1733, "both", "$400 a week"],
      [null, "Eating out", 200, "both", "April, plus a date a week"],
      [null, "Household and miscellaneous", 264, "both", ""],
    ]],
    ["Phones, health and personal", [
      [null, "AT&T", 343.98, "both", "Overlapping with Verizon. Dropping it is the single biggest cut left."],
      [null, "Verizon", 189.51, "both", "$533.49 a month on phones while both run"],
      [null, "Vitamins", 119.95, "his", ""],
      [null, "Pharmacy", 143, "his", ""],
      [null, "Personal subscriptions", 259.34, "both", "Apple 134.91 · LinkedIn 39.99 · Hulu 37.48 · Proton 16.98 · Disney+ 13 · Dropbox 11.99 · Coinbase 4.99"],
      [null, "Personal allowance — his", 100, "his", ""],
      [null, "Personal allowance — hers", 100, "hers", ""],
      [null, "Pets — food and vet fund", 125, "both", ""],
    ]],
    ["Software, on personal cards", [
      [null, "Anthropic", 200, "his", "Moved off Apple to direct billing, which saved $49.99 a month"],
      [null, "DigitalOcean", 84.19, "his", "Was $49.04 in August. Something is scaling."],
      [null, "Supabase", 77.68, "his", ""],
      [null, "OpenAI", 50.99, "his", ""],
      [null, "Kinsta hosting", 124, "his", "Ends after November"],
      [null, "Pantheon", 55, "his", "Ends after November"],
    ]],
    ["Debt", [
      ["april_card", "April's credit card", 150, "hers", "Paid from salon revenue. The balance is on the card page."],
      [null, "IRS installment agreement", 200, "his", "Pre-marriage balance, about $12,533"],
      ["ring", "Ring — Rare Carat lease", 336.6, "his", "$168.30 twice a month. The early buyout discount expired 8 October."],
    ]],
  ];

  const timestamp = now();
  let sort = 0;
  db.transaction((tx) => {
    for (const [groupName, lines] of SEED) {
      sort += 100;
      lines.forEach(([slug, label, amount, owner, note], i) => {
        tx.insert(schema.householdLines)
          .values({
            id: newId(),
            slug,
            groupName,
            label,
            note: note || null,
            amount: parseDollarsToCents(amount),
            owner,
            sortOrder: sort + i,
            createdAt: timestamp,
            updatedAt: timestamp,
          })
          .run();
      });
    }
  });
  return true;
}

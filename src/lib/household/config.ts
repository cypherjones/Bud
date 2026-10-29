import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { now } from "@/lib/utils/format";

/**
 * Household plan inputs — everything on the April + AJ plan that isn't a
 * budget line. Stored as one JSON blob in `settings` under SETTINGS_KEY so
 * both of them see the same numbers. All amounts are DOLLARS (planning
 * figures, not ledger values). Defaults are the 25 Oct 2026 plan.
 */
export const SETTINGS_KEY = "household_plan";

const num = (d: number) => z.number().catch(d);

const incomeSchema = z.object({
  hisNet: num(6375), // Navusoft, 2 checks of $3,187.45
  herNet: num(0), // Left out for now; the salon pays her own lines (see /plan/salon)
  draw: num(0), // Meridian — closed, final draw 27 Oct
  boys: num(930), // Simon and Frank
  tithePct: num(10),
  savings: num(0), // per month, into the savings accounts
});

const futuresSchema = z.object({ aprilTakeHome: num(2520) });

const cardSchema = z.object({ balance: num(1600), apr: num(24) });

const bonusSchema = z.object({
  gross: num(9251.69),
  tithePct: num(10),
  ringBuyout: z.boolean().catch(false),
  ringBuyoutCost: num(1346.41),
  other: num(0),
});

const taxSchema = z.object({
  // What the user moves on /tax
  herProfit: num(0),
  // Meridian closed 27 Oct 2026; the bank shows 13 draws of $1,875 from 27 Apr (see /tax)
  guaranteedPayments: num(37500),
  upe: num(0),
  kids: num(3),
  k1Loss: num(0),
  giving: num(0),
  tuition: num(0),
  // His pay, from the stubs — rarely changes
  wagesGross: num(127993),
  section125: num(5163),
  k401PerCheck: num(239.32),
  withholdingPerCheck: num(943.59),
  // Federal withheld year to date, from the last stub. 0 = estimate from the per-check figure.
  withheldYtd: num(0),
  checksPerYear: num(24),
  // Scenario columns on the W-4 table
  upeIfAmended: num(8400),
  k1ShareIfUsable: num(43578),
  // Used only when no active IRS obligation is tracked on /tax
  irsBalanceFallback: num(12533),
});

export const householdConfigSchema = z.object({
  income: incomeSchema.catch(() => incomeSchema.parse({})),
  futures: futuresSchema.catch(() => futuresSchema.parse({})),
  card: cardSchema.catch(() => cardSchema.parse({})),
  bonus: bonusSchema.catch(() => bonusSchema.parse({})),
  tax: taxSchema.catch(() => taxSchema.parse({})),
});

export type HouseholdConfig = z.infer<typeof householdConfigSchema>;

/** Deep-partial patch: each section may send any subset of its fields. */
const strictNum = z.number(); // v4 rejects NaN / Infinity
export const householdConfigPatchSchema = z.object({
  income: z.partialRecord(incomeSchema.keyof(), strictNum).optional(),
  futures: z.object({ aprilTakeHome: strictNum }).partial().optional(),
  card: z.object({ balance: strictNum, apr: strictNum }).partial().optional(),
  bonus: z
    .object({ gross: strictNum, tithePct: strictNum, ringBuyout: z.boolean(), ringBuyoutCost: strictNum, other: strictNum })
    .partial()
    .optional(),
  tax: z.partialRecord(taxSchema.keyof(), strictNum).optional(),
});

export type HouseholdConfigPatch = z.infer<typeof householdConfigPatchSchema>;

export function getHouseholdConfig(): HouseholdConfig {
  const row = db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(eq(schema.settings.key, SETTINGS_KEY))
    .get();
  let raw: unknown = {};
  if (row) {
    try {
      raw = JSON.parse(row.value);
    } catch {
      raw = {};
    }
  }
  const parsed = householdConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : householdConfigSchema.parse({});
}

export function updateHouseholdConfig(patch: HouseholdConfigPatch): HouseholdConfig {
  const current = getHouseholdConfig();
  const next = householdConfigSchema.parse({
    income: { ...current.income, ...patch.income },
    futures: { ...current.futures, ...patch.futures },
    card: { ...current.card, ...patch.card },
    bonus: { ...current.bonus, ...patch.bonus },
    tax: { ...current.tax, ...patch.tax },
  });
  const value = JSON.stringify(next);
  db.insert(schema.settings)
    .values({ key: SETTINGS_KEY, value, updatedAt: now() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: now() } })
    .run();
  return next;
}

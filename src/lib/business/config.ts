import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { now } from "@/lib/utils/format";
import { APP_MODELS, APP_STATUSES } from "./calc";

/**
 * Business plans — April's salon and AJ's side work. One JSON blob in
 * `settings` under SETTINGS_KEY, same pattern as the household plan. All
 * amounts are DOLLARS. Salon defaults are the 25 Oct plan's figures (about
 * $600 a week gross, $250 a week booth rent, GlossGenius $25 a month);
 * everything else starts at zero until someone fills it in.
 */
export const SETTINGS_KEY = "business_plans";

const num = (d: number) => z.number().catch(d);

const salonSchema = z.object({
  avgTicket: num(60),
  clientsPerWeek: num(10),
  weeksWorked: num(52), // weeks a year she's behind the chair
  boothRentWeekly: num(250), // owed all 52 weeks
  software: num(25), // GlossGenius, per month
  supplies: num(0), // product, tools, per month
  processingPct: num(0), // card processing on what clients pay
  other: num(0), // per month
  setAsidePct: num(30), // self-employment tax plus income tax
  targetTakeHome: num(2520), // what the plan's futures assume she nets
});


const appSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().max(80),
  status: z.enum(APP_STATUSES).catch("idea"),
  model: z.enum(APP_MODELS).catch("paid"),
  price: num(0), // one-off price, or per month for subscriptions
  unitsPerMonth: num(0), // sales, or paying subscribers
  costMonthly: num(0), // API, hosting
  note: z.string().max(300).catch(""),
});

const consultingSchema = z.object({
  rate: num(100), // per hour — a starting guess, not a quote
  hoursPerMonth: num(0),
  costs: num(0), // per month
});

const SEED_APPS: z.infer<typeof appSchema>[] = [
  {
    id: "packrat",
    name: "PackRat",
    status: "building",
    model: "paid",
    price: 0,
    unitsPerMonth: 0,
    costMonthly: 0,
    note: "Loads a moving truck: inventory, a 3D layout from Claude, a load-day checklist. Claude calls go through a Cloudflare Worker, so every user costs API money.",
  },
  {
    id: "trust",
    name: "Trust",
    status: "building",
    model: "paid",
    price: 0,
    unitsPerMonth: 0,
    costMonthly: 0,
    note: "Photograph the paper chart and log the week.",
  },
];

const sideSchema = z.object({
  goal: num(500), // per month, after costs — the May plan's side-income target
  setAsidePct: num(30),
  appleCommissionPct: num(15), // Small Business Program; 30% without it
  developerProgram: num(99), // per year
  consulting: consultingSchema.catch(() => consultingSchema.parse({})),
  apps: z.array(appSchema).max(20).catch(SEED_APPS),
});

export const businessConfigSchema = z.object({
  salon: salonSchema.catch(() => salonSchema.parse({})),
  side: sideSchema.catch(() => sideSchema.parse({ apps: SEED_APPS })),
});

export type BusinessConfig = z.infer<typeof businessConfigSchema>;
export type SalonPlan = BusinessConfig["salon"];
export type SidePlan = BusinessConfig["side"];
export type AppPlan = SidePlan["apps"][number];

const strictNum = z.number();
export const businessConfigPatchSchema = z.object({
  salon: z.partialRecord(salonSchema.keyof(), strictNum).optional(),
  side: z
    .object({
      goal: strictNum,
      setAsidePct: strictNum,
      appleCommissionPct: strictNum,
      developerProgram: strictNum,
      consulting: z.partialRecord(consultingSchema.keyof(), strictNum),
      apps: z.array(appSchema).max(20),
    })
    .partial()
    .optional(),
});

export type BusinessConfigPatch = z.infer<typeof businessConfigPatchSchema>;

export function getBusinessConfig(): BusinessConfig {
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
  const parsed = businessConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : businessConfigSchema.parse({});
}

export function updateBusinessConfig(patch: BusinessConfigPatch): BusinessConfig {
  const current = getBusinessConfig();
  const next = businessConfigSchema.parse({
    salon: { ...current.salon, ...patch.salon },
    side: {
      ...current.side,
      ...patch.side,
      consulting: { ...current.side.consulting, ...patch.side?.consulting },
    },
  });
  const value = JSON.stringify(next);
  db.insert(schema.settings)
    .values({ key: SETTINGS_KEY, value, updatedAt: now() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: now() } })
    .run();
  return next;
}

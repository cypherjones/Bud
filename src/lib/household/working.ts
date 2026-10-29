import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { now } from "@/lib/utils/format";
import { getHouseholdLines, updateHouseholdLine, createHouseholdLine } from "./lines";
import { updateHouseholdConfig } from "./config";
import { syncBudgetsFromPlan } from "./sync";
import { EMPTY_SCENARIO, type Scenario } from "./scenario";

/** The working budget lives in settings beside the plan, as overrides on it. */
const KEY = "working_budget";

const cents = z.number().int().min(0).max(10_000_000);
const money = z.number().min(0).max(100_000);

export const scenarioSchema = z.object({
  lines: z.record(z.string().min(1), z.object({ amount: cents.optional(), cut: z.boolean().optional() })),
  added: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        groupName: z.string().min(1).max(100),
        label: z.string().min(1).max(200),
        amount: cents,
        owner: z.enum(["his", "hers", "both"]),
        categoryId: z.string().min(1).nullable(),
      }),
    )
    .max(100),
  income: z
    .object({ hisNet: money, herNet: money, draw: money, boys: money, tithePct: z.number().min(0).max(100), savings: money })
    .partial(),
});

export function getScenario(): Scenario {
  const row = db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, KEY)).get();
  if (!row) return EMPTY_SCENARIO;
  try {
    const parsed = scenarioSchema.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : EMPTY_SCENARIO;
  } catch {
    return EMPTY_SCENARIO;
  }
}

export function saveScenario(s: Scenario) {
  const value = JSON.stringify(s);
  db.insert(schema.settings)
    .values({ key: KEY, value, updatedAt: now() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: now() } })
    .run();
}

export function clearScenario() {
  db.delete(schema.settings).where(eq(schema.settings.key, KEY)).run();
}

/**
 * Make the working budget the real one: overridden amounts are written, cut
 * lines go to $0 (kept, so they can come back), what-ifs become lines, and
 * income changes go to the plan. Then the scratch copy starts over.
 */
export function applyScenarioToPlan(s: Scenario): { changed: number; added: number } {
  const live = new Map(getHouseholdLines().map((l) => [l.id, l]));
  let changed = 0;
  for (const [id, o] of Object.entries(s.lines)) {
    const line = live.get(id);
    if (!line || line.slug === "tithe") continue;
    const amount = o.cut ? 0 : o.amount;
    if (amount === undefined || amount === line.amount) continue;
    updateHouseholdLine(id, { amount: amount / 100 });
    changed++;
  }
  for (const a of s.added) {
    createHouseholdLine({ groupName: a.groupName, label: a.label, amount: a.amount / 100, owner: a.owner, categoryId: a.categoryId });
  }
  if (Object.keys(s.income).length > 0) updateHouseholdConfig({ income: s.income });
  syncBudgetsFromPlan();
  clearScenario();
  return { changed, added: s.added.length };
}

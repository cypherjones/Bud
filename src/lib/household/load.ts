import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { getHouseholdConfig } from "./config";
import { getHouseholdLines, seedHouseholdLinesIfEmpty } from "./lines";
import { linkHouseholdLinesOnce } from "./sync";
import { seedHouseholdPlanTasksOnce } from "@/lib/actions/action-plan";
import { seedBusinessPlanTasksOnce } from "@/lib/business/tasks";

/** Every plan page starts here. The seeds are idempotent — no-ops after the first visit. */
export function loadPlan() {
  seedHouseholdLinesIfEmpty();
  linkHouseholdLinesOnce();
  seedHouseholdPlanTasksOnce();
  seedBusinessPlanTasksOnce();
  return { config: getHouseholdConfig(), lines: getHouseholdLines() };
}

/** Dollars across the savings accounts that count toward reports, or null if there are none. */
export function getSavingsBalance(): number | null {
  const rows = db
    .select({ balance: schema.accounts.balance })
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.accountType, "depository"),
        eq(schema.accounts.subtype, "savings"),
        eq(schema.accounts.excludeFromReports, false),
      ),
    )
    .all();
  if (rows.length === 0) return null;
  return rows.reduce((s, r) => s + (r.balance ?? 0), 0) / 100;
}

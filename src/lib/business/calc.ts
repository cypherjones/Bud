/**
 * Business plan math — pure, client-safe. DOLLARS throughout, per month
 * unless the name says otherwise.
 */
import type { SalonPlan, SidePlan, AppPlan } from "./config";

export const APP_STATUSES = ["idea", "building", "beta", "live"] as const;
export const APP_MODELS = ["paid", "subscription", "free"] as const;

const clamp0 = (n: number) => Math.max(0, Number.isFinite(n) ? n : 0);

// Self-employment tax on net earnings: 92.35% of profit at 15.3%
export const SE_TAX_RATE = 0.9235 * 0.153;

// Her profit lands on a joint return with AJ's wages, which puts the top of
// it in the 22% bracket. The 20% QBI deduction applies to a sole proprietor.
export const JOINT_MARGINAL_RATE = 0.22;
const QBI = 0.2;

/** Estimated federal tax on a year of her Schedule C profit: SE tax plus
 *  income tax at the household's marginal rate. */
export function salonTaxOnProfit(annualProfit: number) {
  const profit = Math.max(0, annualProfit);
  const se = profit * SE_TAX_RATE;
  const income = Math.max(0, profit - se / 2) * (1 - QBI) * JOINT_MARGINAL_RATE;
  return { se, income, total: se + income };
}

const PER_MONTH = 52 / 12;

/**
 * A month of the chair under April's Profit First split. Every bucket is a
 * percentage of what clients pay. Costs come out of the operating bucket;
 * if they run past it, the overrun comes out of her pay, so "home" is what
 * really reaches the household.
 */
export function salonMonth(s: SalonPlan, grossWeekOverride?: number) {
  const worked = Math.min(52, clamp0(s.weeksWorked)) / 52;
  const proc = clamp0(s.processingPct) / 100;
  const grossWeek = grossWeekOverride ?? clamp0(s.avgTicket) * clamp0(s.clientsPerWeek);
  const gross = grossWeek * PER_MONTH * worked;
  const processing = gross * proc;
  // Booth rent is owed every week; the rest only in weeks she works
  const boothRent = clamp0(s.boothRentWeekly) * PER_MONTH;
  const weekly = (n: number) => clamp0(n) * PER_MONTH * worked;
  const costLines = {
    supplies: weekly(s.suppliesWeekly),
    cleaning: weekly(s.cleaningWeekly),
    marketing: weekly(s.marketingWeekly),
    snacks: weekly(s.snacksWeekly),
    gas: weekly(s.gasWeekly),
    software: clamp0(s.software),
    other: clamp0(s.other),
  };
  const fixed = boothRent + Object.values(costLines).reduce((t, n) => t + n, 0);
  const costs = fixed + processing;
  const profit = gross - costs;

  const pct = (n: number) => clamp0(n) / 100;
  const buckets = {
    tithe: gross * pct(s.tithePct),
    ownerPay: gross * pct(s.ownerPayPct),
    opex: gross * pct(s.opexPct),
    profit: gross * pct(s.profitPct),
    tax: gross * pct(s.taxPct),
  };
  const splitPct = s.tithePct + s.ownerPayPct + s.opexPct + s.profitPct + s.taxPct;
  const opexOver = costs - buckets.opex; // > 0: costs run past the bucket
  const home = buckets.ownerPay - Math.max(0, opexOver);

  const tax = salonTaxOnProfit(profit * 12);
  const taxNeed = tax.total / 12;

  return {
    grossWeek,
    gross,
    processing,
    boothRent,
    costLines,
    fixed,
    costs,
    profit,
    buckets,
    splitPct,
    opexOver,
    home,
    tax,
    taxNeed,
    taxShort: taxNeed - buckets.tax,
    annualProfit: profit * 12,
    quarterly: tax.total / 4,
  };
}

/** Takings a week that bring `homeMonthly` home under the split. */
export function salonWeekFor(s: SalonPlan, homeMonthly: number): number | null {
  const worked = Math.min(52, clamp0(s.weeksWorked)) / 52;
  const own = clamp0(s.ownerPayPct) / 100;
  if (own <= 0 || worked <= 0) return null;
  const { fixed } = salonMonth(s, 0);
  const proc = clamp0(s.processingPct) / 100;
  const opex = clamp0(s.opexPct) / 100;
  let gross = homeMonthly / own;
  if (fixed + proc * gross > opex * gross) {
    const denom = own + opex - proc;
    if (denom <= 0) return null;
    gross = (homeMonthly + fixed) / denom;
  }
  return gross / (PER_MONTH * worked);
}

export function appMonth(app: AppPlan, commissionPct: number) {
  const gross = app.model === "free" ? 0 : clamp0(app.price) * clamp0(app.unitsPerMonth);
  const commission = gross * (clamp0(commissionPct) / 100);
  return { gross, commission, net: gross - commission - clamp0(app.costMonthly) };
}

export function sideMonth(p: SidePlan) {
  const apps = p.apps.map((a) => ({ app: a, ...appMonth(a, p.appleCommissionPct) }));
  const appsNet = apps.reduce((s, a) => s + a.net, 0);
  const developer = clamp0(p.developerProgram) / 12;
  const consultingGross = clamp0(p.consulting.rate) * clamp0(p.consulting.hoursPerMonth);
  const consultingNet = consultingGross - clamp0(p.consulting.costs);
  const profit = appsNet - developer + consultingNet;
  const keep = 1 - clamp0(p.setAsidePct) / 100;
  const setAside = Math.max(0, profit) * (1 - keep);
  const takeHome = profit - setAside;
  const gap = clamp0(p.goal) - takeHome;
  // Consulting hours that would close the gap, on top of what's planned
  const extraHours = gap > 0 && p.consulting.rate > 0 && keep > 0 ? gap / keep / p.consulting.rate : 0;
  return { apps, appsNet, developer, consultingGross, consultingNet, profit, setAside, takeHome, gap, extraHours };
}

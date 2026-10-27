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

export function salonMonth(s: SalonPlan) {
  const weeks = Math.min(52, clamp0(s.weeksWorked));
  const proc = clamp0(s.processingPct) / 100;
  const keep = 1 - clamp0(s.setAsidePct) / 100;
  const gross = (clamp0(s.avgTicket) * clamp0(s.clientsPerWeek) * weeks) / 12;
  const processing = gross * proc;
  const boothRent = (clamp0(s.boothRentWeekly) * 52) / 12;
  const fixed = boothRent + clamp0(s.software) + clamp0(s.supplies) + clamp0(s.other);
  const expenses = fixed + processing;
  const profit = gross - expenses;
  const setAside = Math.max(0, profit) * (clamp0(s.setAsidePct) / 100);
  const takeHome = profit - setAside;
  // What one more weekly client is worth a month, before the set-aside
  const perWeeklyClient = (clamp0(s.avgTicket) * (1 - proc) * weeks) / 12;
  const clientsToBreakEven = perWeeklyClient > 0 ? fixed / perWeeklyClient : null;
  const clientsForTarget = perWeeklyClient > 0 && keep > 0 ? (clamp0(s.targetTakeHome) / keep + fixed) / perWeeklyClient : null;
  const plusFivePerTicket = (5 * clamp0(s.clientsPerWeek) * weeks * (1 - proc) * keep) / 12;
  const annualProfit = profit * 12;
  const seTaxAnnual = Math.max(0, annualProfit) * SE_TAX_RATE;
  return {
    gross,
    processing,
    boothRent,
    fixed,
    expenses,
    profit,
    setAside,
    takeHome,
    clientsToBreakEven,
    clientsForTarget,
    plusFivePerTicket,
    annualProfit,
    seTaxAnnual,
    quarterly: (setAside * 12) / 4,
  };
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

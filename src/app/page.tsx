import Link from "next/link";
import { PlanPage, SectionHead } from "@/components/plan/plan-ui";
import { MonthStrip } from "@/components/dashboard/month-strip";
import { Notices } from "@/components/dashboard/notices";
import { SinceLastVisitStrip } from "@/components/dashboard/since-last-visit-strip";
import { WhereItWent } from "@/components/dashboard/where-it-went";
import { ComingUp } from "@/components/dashboard/coming-up";
import { DebtsSection } from "@/components/dashboard/debts-section";
import { CreditTaxStrip } from "@/components/dashboard/credit-tax-strip";
import { loadPlan } from "@/lib/household/load";
import { getMonthSpendByCategory, getTrackableCategories } from "@/lib/household/sync";
import { budgetTotals, planVsActual } from "@/lib/household/calc";
import { rollRecurringForward } from "@/lib/actions/recurring";
import { getUpcomingDebtDeadlines } from "@/lib/actions/debts";
import {
  getMetrics,
  getSpendingByCategory,
  getDebtSummary,
  getCreditSummary,
  getTaxSummary,
  getUpcomingBillsWindow,
  getSinceLastVisit,
  getTotalBalance,
  getDebtFreeProjection,
  getUpcomingBillCluster,
  getKillList,
} from "@/lib/actions/dashboard";
import { getSpendingVelocity } from "@/lib/actions/reports";

export const dynamic = "force-dynamic";

export default function ThisMonthPage() {
  // The plan is the budget; this page is what actually happened against it.
  rollRecurringForward();
  const { config, lines } = loadPlan();
  const planTotals = budgetTotals(lines, config.income);
  const actual = planVsActual(lines, config.income, getMonthSpendByCategory());

  const metrics = getMetrics();
  const velocity = getSpendingVelocity();
  const balance = getTotalBalance();
  const byCategory = getSpendingByCategory();
  const debts = getDebtSummary();
  const debtFree = getDebtFreeProjection();
  const credit = getCreditSummary();
  const tax = getTaxSummary();
  const killList = getKillList();

  const hasAccounts = balance.accountCount > 0;
  const hasMonthData = velocity.totalSpent > 0 || metrics.income > 0;
  const incomeTrend =
    metrics.priorTrailing30Income > 0
      ? Math.round(((metrics.trailing30Income - metrics.priorTrailing30Income) / metrics.priorTrailing30Income) * 100)
      : null;

  // Categories spent in this month that no plan line tracks.
  const trackedCategoryIds = new Set(lines.filter((l) => l.categoryId).map((l) => l.categoryId as string));
  const categoryNameById = new Map(getTrackableCategories().map((c) => [c.id, c.name]));
  const trackedNames = new Set([...trackedCategoryIds].map((id) => categoryNameById.get(id)).filter(Boolean));
  const untracked = byCategory.filter((c) => !trackedNames.has(c.name)).map((c) => ({ name: c.name, dollars: c.value / 100 }));

  const monthName = new Date().toLocaleDateString("en-US", { month: "long" });

  return (
    <PlanPage
      title={`${monthName}, so far`}
      sub={
        <>
          What is actually happening this month, against{" "}
          <Link href="/budget" className="underline decoration-dotted underline-offset-2">the budget</Link>. The plan is edited there; this page only reads it.
        </>
      }
    >
      <div className="space-y-3">
        <SinceLastVisitStrip {...getSinceLastVisit()} />
        <Notices deadlines={getUpcomingDebtDeadlines(30)} cluster={getUpcomingBillCluster()} />
      </div>

      <MonthStrip
        planNet={planTotals.net}
        planOut={planTotals.out}
        planSavings={planTotals.savings}
        planMoneyIn={planTotals.moneyIn}
        spentCents={velocity.totalSpent}
        projectedCents={hasMonthData ? velocity.projectedMonthTotal : null}
        daysElapsed={velocity.daysElapsed}
        daysInMonth={velocity.daysInMonth}
        plannedTracked={actual.plannedTracked}
        spentTracked={actual.spentTracked}
        trackedCount={actual.trackedCount}
        lineCount={actual.lineCount}
        overLines={actual.overLines}
        overTotal={actual.overTotal}
        balanceCents={hasAccounts ? balance.totalBalance : null}
        accountCount={balance.accountCount}
        incomeCents={hasAccounts ? metrics.trailing30Income : null}
        incomeTrend={hasAccounts ? incomeTrend : null}
      />

      <section className="space-y-3">
        <SectionHead title="Where it went" sub="This month's spending, line by line against the plan." />
        <WhereItWent
          tracked={actual.tracked}
          spentTotal={velocity.totalSpent / 100}
          spentTracked={actual.spentTracked}
          untracked={untracked}
          daysElapsed={velocity.daysElapsed}
          daysInMonth={velocity.daysInMonth}
        />
      </section>

      <section className="space-y-3">
        <SectionHead title="Coming up" sub="What the schedule says lands next, and the subscriptions waiting to be cut." />
        <ComingUp bills={getUpcomingBillsWindow(7)} killList={killList.items} killListMonthly={killList.totalMonthly} />
      </section>

      <section className="space-y-3">
        <SectionHead title="Debts" sub="Balances as last updated on Debts. Payments show up here once they're matched to a debt." />
        <DebtsSection
          debts={debts.debts}
          totalActive={debts.totalActive}
          totalOriginal={debts.totalOriginal}
          progress={debts.progress}
          debtFreeAt={debtFree.atRecommended ?? debtFree.atMinimum}
          debtFreeMonths={debtFree.monthsAtRecommended ?? debtFree.monthsAtMinimum}
        />
      </section>

      <section className="space-y-3">
        <SectionHead title="Credit and tax" />
        <CreditTaxStrip credit={credit} tax={{ totalOwed: tax.totalOwed, nextDue: tax.nextDue, count: tax.obligations.length }} />
      </section>
    </PlanPage>
  );
}

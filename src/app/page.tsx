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
  getUpcomingBillsWindow,
  getSinceLastVisit,
  getTotalBalance,
  getUpcomingBillCluster,
} from "@/lib/actions/dashboard";
import { getSpendingVelocity } from "@/lib/actions/reports";
import { logSeenDebtPayments } from "@/lib/debts/seen-payments";
import { getSubscriptionToDo } from "@/lib/subscriptions/view";
import { getDebtsPicture } from "@/lib/debts/picture";
import { getCreditPicture } from "@/lib/credit/picture";

export const dynamic = "force-dynamic";

export default function ThisMonthPage() {
  // The plan is the budget; this page is what actually happened against it.
  rollRecurringForward();
  logSeenDebtPayments();
  const { config, lines } = loadPlan();
  const planTotals = budgetTotals(lines, config.income);
  const actual = planVsActual(lines, config.income, getMonthSpendByCategory());

  const metrics = getMetrics();
  const velocity = getSpendingVelocity();
  const balance = getTotalBalance();
  const byCategory = getSpendingByCategory();
  const debts = getDebtsPicture();
  const credit = getCreditPicture();
  const late = debts.cycles.filter((c) => c.state !== "paid" && c.daysLate > 0);
  const irsDebt = debts.planDebts.find((d) => /irs/i.test(d.label));
  const irsCycle = irsDebt?.cycles[0];
  const killList = getSubscriptionToDo();

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
        <Notices deadlines={getUpcomingDebtDeadlines(30)} cluster={getUpcomingBillCluster()} late={late} />
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
        <ComingUp bills={getUpcomingBillsWindow(7)} killList={killList} killListMonthly={killList.reduce((s, k) => s + k.monthlyCost, 0)} />
      </section>

      <section className="space-y-3">
        <SectionHead title="Debts" sub="Loan balances move with each payment Bud sees in the bank." />
        <DebtsSection
          rows={[
            ...debts.loans.map((l) => ({ name: l.planLine?.label.replace(/^auto loan\s*[—-]\s*/i, "") ?? l.debt.creditorName, balance: l.debt.currentBalance, estimated: l.estimated, apr: l.debt.interestRate })),
            ...debts.planDebts.filter((d) => d.balance).map((d) => ({ name: d.label, balance: d.balance!, estimated: false, apr: d.apr })),
          ]}
          owed={debts.totals.owed}
          monthly={debts.totals.monthly}
          debtFree={debts.totals.debtFree}
          unpaid={debts.unpaid.map((u) => u.debt.creditorName)}
        />
      </section>

      <section className="space-y-3">
        <SectionHead title="Credit and tax" />
        <CreditTaxStrip
          credit={
            credit.latest
              ? {
                  score: credit.latest.score,
                  date: credit.latest.date,
                  monthsOld: credit.monthsOld ?? 0,
                  tier: credit.tier ?? "",
                  cardUsePct: credit.cards.limit > 0 ? Math.round((credit.cards.balance / credit.cards.limit) * 100) : null,
                }
              : null
          }
          irs={
            irsDebt && irsCycle
              ? { balance: irsDebt.balance ?? 0, monthly: irsDebt.monthly, dueDate: irsCycle.dueDate, nextDueDate: irsCycle.nextDueDate, paidOn: irsCycle.paidOn, daysLate: irsCycle.daysLate }
              : null
          }
        />
      </section>
    </PlanPage>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getMonthlySummary,
  getFrivolousSpending,
  getCategoryTrends,
  getSpendingVelocity,
} from "@/lib/actions/reports";
import { getActiveReportingMonth } from "@/lib/actions/dashboard";
import { ReportTabs } from "@/components/reports/report-tabs";
import { EmptyMonthBanner } from "@/components/dashboard/empty-month-banner";
import { PlanPage } from "@/components/plan/plan-ui";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  // Subscriptions moved to their own page; old task links still point here.
  if (tab === "subscriptions") redirect("/subscriptions");
  const activeMonth = getActiveReportingMonth();

  const monthlySummary = getMonthlySummary(activeMonth.monthStart);
  const velocity = getSpendingVelocity();
  const frivolous = getFrivolousSpending(activeMonth.monthStart);
  const categoryTrends = getCategoryTrends(6);

  // Categories list for inline recategorization in the Discretionary "Other"
  // bucket drill-down. Same shape /transactions uses.
  const categories = db
    .select({
      id: schema.categories.id,
      name: schema.categories.name,
      color: schema.categories.color,
      groupId: schema.categories.groupId,
      groupName: schema.categoryGroups.name,
      groupColor: schema.categoryGroups.color,
      groupSort: schema.categoryGroups.sortOrder,
    })
    .from(schema.categories)
    .leftJoin(schema.categoryGroups, eq(schema.categories.groupId, schema.categoryGroups.id))
    .all();

  const link = "underline decoration-dotted underline-offset-2";
  return (
    <PlanPage
      title="Reports"
      sub={
        <>
          Looking back at {activeMonth.monthLabel} and the six months before it. Looking ahead is on{" "}
          <Link href="/next" className={link}>Next month</Link>; subscriptions on <Link href="/subscriptions" className={link}>Subscriptions</Link>;
          debts on <Link href="/debts" className={link}>Debts</Link>.
        </>
      }
    >
      {activeMonth.isFallback && activeMonth.fallbackReason && <EmptyMonthBanner reason={activeMonth.fallbackReason} />}
      <ReportTabs
        initialTab={tab}
        monthlySummary={monthlySummary}
        velocity={velocity}
        frivolous={frivolous}
        categoryTrends={categoryTrends}
        categories={categories}
      />
    </PlanPage>
  );
}

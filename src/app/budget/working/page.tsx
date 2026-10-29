import Link from "next/link";
import { PlanPage } from "@/components/plan/plan-ui";
import { WorkingBudget } from "@/components/plan/working-budget";
import { loadPlan } from "@/lib/household/load";
import { getScenario } from "@/lib/household/working";
import { getTrackableCategories } from "@/lib/household/sync";
import { monthAhead } from "@/lib/household/month-ahead";
import { rollRecurringForward } from "@/lib/actions/recurring";

export const dynamic = "force-dynamic";

export default function WorkingBudgetPage() {
  rollRecurringForward();
  const { config, lines } = loadPlan();
  const ahead = monthAhead(lines, config.income);
  const monthName = new Date(ahead.monthStart + "T00:00:00").toLocaleDateString("en-US", { month: "long" });

  return (
    <PlanPage
      eyebrow={{ href: "/budget", label: "The budget" }}
      title="Working budget"
      sub={
        <>
          A scratch copy of the <Link href="/budget" className="underline decoration-dotted underline-offset-2">budget</Link> for
          testing cuts and what-ifs. Nothing here changes the real budget, {monthName}&apos;s projection or anything else in Bud
          until you apply it.
        </>
      }
    >
      <WorkingBudget
        liveLines={lines}
        liveIncome={config.income}
        initialScenario={getScenario()}
        categories={getTrackableCategories()}
        projection={{
          monthName,
          monthStart: ahead.monthStart,
          daysInMonth: ahead.daysInMonth,
          daily: ahead.daily,
          scheduledByCategory: ahead.scheduledByCategory,
        }}
      />
    </PlanPage>
  );
}

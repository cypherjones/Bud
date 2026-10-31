import { loadPlan } from "@/lib/household/load";
import { budgetTotals } from "@/lib/household/calc";
import { getBusinessConfig } from "@/lib/business/config";
import { SalonPlanner } from "@/components/plan/salon-planner";
import { PlanPage, Aside } from "@/components/plan/plan-ui";
import { PageTasks } from "@/components/plan/page-tasks";

export const dynamic = "force-dynamic";

export default function SalonPage() {
  const { config, lines } = loadPlan();
  const withoutHer = budgetTotals(lines, { ...config.income, herNet: 0 });
  return (
    <PlanPage
      eyebrow={{ href: "/plan", label: "Business" }}
      title="April's salon"
      sub="Three days a week behind the chair. Her own plan sets the costs and splits every dollar clients pay; this page holds it against the household budget."
    >
      <SalonPlanner
        initial={getBusinessConfig().salon}
        taxHerProfit={config.tax.herProfit}
        budgetNet={withoutHer.net}
        herNet={config.income.herNet}
      />
      <Aside title="What changed since her plan">
        <p>
          Her plan was written before the wedding, for one person. Its $4,750 a month of personal need — rent, food, car, phone —
          is now inside the household budget, so the salon no longer has to cover it. What&apos;s left on her side of the budget is
          her card and her allowance; everything else she brings home goes at the budget&apos;s gap.
        </p>
        <p>
          Her paused personal items mostly have a budget line now: her allowance, the car maintenance fund and savings. Whether
          those pause too is a budget decision for both of you.
        </p>
      </Aside>
      <PageTasks link="/plan/salon" />
    </PlanPage>
  );
}

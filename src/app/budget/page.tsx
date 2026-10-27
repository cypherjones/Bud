import { loadPlan, getSavingsBalance } from "@/lib/household/load";
import { getMonthSpendByCategory, getTrackableCategories } from "@/lib/household/sync";
import { BudgetEditor } from "@/components/plan/budget-editor";
import { BudgetNotes } from "@/components/plan/reference/budget-notes";
import { PlanPage } from "@/components/plan/plan-ui";
import { PageTasks } from "@/components/plan/page-tasks";

export const dynamic = "force-dynamic";

export default function BudgetPage() {
  const { config, lines } = loadPlan();
  const monthLabel = new Date().toLocaleDateString("en-US", { month: "long" });

  return (
    <PlanPage
      eyebrow={{ href: "/plan", label: "April and AJ's Plan" }}
      title="The budget"
      sub="The household budget you build together. Every number in a box can be changed, every line can be AJ's, April's or shared, and both of you see the same thing. Category budgets across Bud follow from it."
    >
      <BudgetEditor
        initialLines={lines}
        initialIncome={config.income}
        savingsBalance={getSavingsBalance()}
        spendByCategory={getMonthSpendByCategory()}
        categories={getTrackableCategories()}
        monthLabel={monthLabel}
        notes={<BudgetNotes />}
      />
      <PageTasks link="/budget" />
    </PlanPage>
  );
}

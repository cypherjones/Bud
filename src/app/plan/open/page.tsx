import { loadPlan } from "@/lib/household/load";
import { getActionPlanItems } from "@/lib/actions/action-plan";
import { getActionQueue } from "@/lib/actions/budget";
import { PlanChecklist } from "@/components/budget/plan-checklist";
import { ActionQueue } from "@/components/budget/action-queue";
import { PlanPage, SectionHead } from "@/components/plan/plan-ui";

export const dynamic = "force-dynamic";

export default function StillOpenPage() {
  loadPlan();
  return (
    <PlanPage
      eyebrow={{ href: "/plan", label: "April and AJ's Plan" }}
      title="Still open"
      sub="Everything that would change the answers in the plan, as tasks. Each page shows its own; this is all of them."
    >
      <PlanChecklist items={getActionPlanItems()} title="Every task" />
      <section className="space-y-3">
        <SectionHead title="What Bud sees in the transactions" sub="Ranked automatically from spending: overspent categories, subscriptions, bills due." />
        <ActionQueue actions={getActionQueue()} />
      </section>
    </PlanPage>
  );
}

import { loadPlan } from "@/lib/household/load";
import { CardPlanner } from "@/components/plan/plan-calculators";
import { PlanPage } from "@/components/plan/plan-ui";

export const dynamic = "force-dynamic";

export default function CardPage() {
  const { config, lines } = loadPlan();
  return (
    <PlanPage
      eyebrow={{ href: "/plan", label: "April and AJ's Plan" }}
      title="April's card"
      sub="Paid from salon revenue. Change either box and the payoff moves; the payment comes from her line in the budget."
    >
      <CardPlanner lines={lines} initialConfig={config} />
    </PlanPage>
  );
}

import { loadPlan } from "@/lib/household/load";
import { BonusPlanner } from "@/components/plan/plan-calculators";
import { BonusOptions } from "@/components/plan/reference/bonus-options";
import { PlanPage } from "@/components/plan/plan-ui";

export const dynamic = "force-dynamic";

export default function BonusPage() {
  const { config, lines } = loadPlan();
  return (
    <PlanPage
      eyebrow={{ href: "/plan", label: "April and AJ's Plan" }}
      title="The bonus"
      sub="It has already been tithed on and banked. This works out what it covers and what moving some of it would do."
    >
      <BonusPlanner lines={lines} initialConfig={config} />
      <BonusOptions />
    </PlanPage>
  );
}

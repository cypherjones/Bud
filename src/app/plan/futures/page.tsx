import { loadPlan } from "@/lib/household/load";
import { FuturesPlanner } from "@/components/plan/plan-calculators";
import { FuturesNotes } from "@/components/plan/reference/futures-notes";
import { PlanPage } from "@/components/plan/plan-ui";

export const dynamic = "force-dynamic";

export default function FuturesPage() {
  const { config, lines } = loadPlan();
  return (
    <PlanPage
      eyebrow={{ href: "/plan", label: "April and AJ's Plan" }}
      title="Three futures"
      sub="Same bills, three different income pictures. The tithe moves with the income in each column."
    >
      <FuturesPlanner lines={lines} initialConfig={config} />
      <FuturesNotes />
    </PlanPage>
  );
}

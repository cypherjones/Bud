import { loadPlan } from "@/lib/household/load";
import { MeridianAgreements } from "@/components/plan/reference/meridian-agreements";
import { PlanPage } from "@/components/plan/plan-ui";
import { PageTasks } from "@/components/plan/page-tasks";

export const dynamic = "force-dynamic";

export default function MeridianPage() {
  const { config } = loadPlan();
  return (
    <PlanPage
      eyebrow={{ href: "/plan", label: "Business" }}
      title="Meridian"
      sub="Closed, with the final draw on 27 October. What's left is the dissolution and the final 2026 return, and the agreements still decide that return."
    >
      <MeridianAgreements guaranteedPayments={config.tax.guaranteedPayments} />
      <PageTasks link="/plan/meridian" />
    </PlanPage>
  );
}

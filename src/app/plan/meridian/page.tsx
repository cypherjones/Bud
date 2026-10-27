import { loadPlan } from "@/lib/household/load";
import { MeridianAgreements } from "@/components/plan/reference/meridian-agreements";
import { PlanPage } from "@/components/plan/plan-ui";
import { PageTasks } from "@/components/plan/page-tasks";

export const dynamic = "force-dynamic";

export default function MeridianPage() {
  loadPlan();
  return (
    <PlanPage
      eyebrow={{ href: "/plan", label: "Business" }}
      title="Meridian"
      sub="Closed, with the final draw on 27 October, but its agreements still decide the 2026 return."
    >
      <MeridianAgreements />
      <PageTasks link="/plan/meridian" />
    </PlanPage>
  );
}

import { loadPlan } from "@/lib/household/load";
import { CarsSection } from "@/components/plan/reference/cars";
import { PlanPage } from "@/components/plan/plan-ui";
import { PageTasks } from "@/components/plan/page-tasks";

export const dynamic = "force-dynamic";

export default function CarsPage() {
  loadPlan();
  return (
    <PlanPage
      eyebrow={{ href: "/plan", label: "April and AJ's Plan" }}
      title="The cars"
      sub="Three vehicles, two notes, seven people. What's known, what isn't, and the options."
    >
      <CarsSection />
      <PageTasks link="/plan/cars" />
    </PlanPage>
  );
}

import { loadPlan } from "@/lib/household/load";
import { getBusinessConfig } from "@/lib/business/config";
import { SidePlanner } from "@/components/plan/side-planner";
import { PlanPage, Aside } from "@/components/plan/plan-ui";
import { PageTasks } from "@/components/plan/page-tasks";

export const dynamic = "force-dynamic";

export default function SideHustlesPage() {
  loadPlan();
  return (
    <PlanPage
      eyebrow={{ href: "/plan", label: "Business" }}
      title="Side hustles"
      sub="AJ's iOS apps and consulting: what each could bring in, what it costs to run, and how far it is from the monthly goal."
    >
      <SidePlanner initial={getBusinessConfig().side} />
      <Aside title="Before the first dollar">
        <p>
          Apple pays within 45 days of the end of each of its fiscal months, net of its commission. The Small Business Program
          halves that commission to 15%, but only after you enrol, so do it before launch.
        </p>
        <p>
          Every app that calls Claude costs money per user. Price PackRat so one heavy user can&apos;t cost more than they paid.
        </p>
      </Aside>
      <PageTasks link="/plan/side-hustles" />
    </PlanPage>
  );
}

import { loadPlan } from "@/lib/household/load";
import { getBusinessConfig } from "@/lib/business/config";
import { SalonPlanner } from "@/components/plan/salon-planner";
import { PlanPage, Aside } from "@/components/plan/plan-ui";
import { PageTasks } from "@/components/plan/page-tasks";

export const dynamic = "force-dynamic";

export default function SalonPage() {
  const { config, lines } = loadPlan();
  const card = lines.find((l) => l.slug === "april_card");
  return (
    <PlanPage
      eyebrow={{ href: "/plan", label: "Business" }}
      title="April's salon"
      sub="A booth-rental chair: she keeps what clients pay and owes the booth rent every week. This is the plan for what it brings in, what it costs, and what it takes to reach the number the household plan is testing."
    >
      <SalonPlanner initial={getBusinessConfig().salon} cardPayment={card ? card.amount / 100 : 0} taxHerProfit={config.tax.herProfit} />
      <Aside title="How it fits the household">
        <p>
          Her income is out of the budget for now, and the lines marked hers — her card and her allowance — come out of the salon.
          The three futures test what changes once she brings home a steady amount; the target above starts at the same number.
        </p>
        <p>
          Her profit is self-employment income on the joint return. Nothing is withheld from it, so it&apos;s paid either as quarterly
          estimates or by AJ withholding extra on his W-4 — /tax works out the second.
        </p>
      </Aside>
      <PageTasks link="/plan/salon" />
    </PlanPage>
  );
}

import { loadPlan } from "@/lib/household/load";
import { budgetTotals, futures } from "@/lib/household/calc";
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
      sub="Same bills, three income pictures. The tithe moves with the income in each column."
    >
      <FuturesPlanner lines={lines} initialConfig={config} />
      <FuturesNotes
        net={budgetTotals(lines, config.income).net}
        cols={futures(lines, config.income, config.futures.aprilTakeHome)}
        draw={config.income.draw}
        aprilTakeHome={config.futures.aprilTakeHome}
      />
    </PlanPage>
  );
}

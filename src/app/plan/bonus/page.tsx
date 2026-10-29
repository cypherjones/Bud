import { loadPlan, getSavingsBalance } from "@/lib/household/load";
import { budgetTotals, bonusAllocation } from "@/lib/household/calc";
import { formatCurrency } from "@/lib/utils/format";
import { BonusPlanner } from "@/components/plan/plan-calculators";
import { BonusOptions } from "@/components/plan/reference/bonus-options";
import { PlanPage, SectionHead, TotalsStrip, Total } from "@/components/plan/plan-ui";

export const dynamic = "force-dynamic";

const usd2 = (dollars: number) => formatCurrency(Math.round(dollars * 100));

export default function BonusPage() {
  const { config, lines } = loadPlan();
  const savings = getSavingsBalance();
  const net = budgetTotals(lines, config.income).net;
  const bonus = bonusAllocation(lines, config.income, config.futures.aprilTakeHome, config.bonus);
  const ring = lines.find((l) => l.slug === "ring");

  return (
    <PlanPage
      eyebrow={{ href: "/plan", label: "April and AJ's Plan" }}
      title="The bonus"
      sub="It was tithed on and banked, and on 28 October $2,651.20 of savings paid off the Apple Card."
    >
      <TotalsStrip cols={4}>
        <Total label="Bonus after tax and tithe" value={usd2(bonus.free)} note={`Estimated, from ${usd2(bonus.gross)} gross`} />
        <Total label="Apple Card payoff" value={usd2(2651.2)} note="28 Oct, from 360 Performance Savings" />
        <Total href="/budget" label="Saved now" value={savings === null ? "—" : usd2(savings)} note="Every counted savings account" />
        <Total href="/budget" label="Left over a month" value={usd2(net)} tone={net >= 0 ? "text-emerald-400" : "text-red-400"}
          note="The real month, from the budget" />
      </TotalsStrip>

      <BonusOptions
        savings={savings}
        gap={Math.max(0, -net)}
        ringMonthly={ring ? ring.amount / 100 : 0}
        ringBuyoutCost={config.bonus.ringBuyoutCost}
        aprilCardBalance={config.card.balance}
      />

      <section className="space-y-3">
        <SectionHead
          title="The calculator, as it was set up"
          sub="Kept for what-ifs. The ring box no longer reflects a real option, and its gap assumes April's take-home from the futures page, so it is smaller than the real month above."
        />
        <BonusPlanner lines={lines} initialConfig={config} />
      </section>
    </PlanPage>
  );
}

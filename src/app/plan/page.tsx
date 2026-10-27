import { getHouseholdConfig } from "@/lib/household/config";
import { getHouseholdLines, seedHouseholdLinesIfEmpty } from "@/lib/household/lines";
import { getActionPlanItems, seedHouseholdPlanTasksOnce } from "@/lib/actions/action-plan";
import { HouseholdPlan } from "@/components/plan/household-plan";
import { BudgetNotes } from "@/components/plan/reference/budget-notes";
import { FuturesNotes } from "@/components/plan/reference/futures-notes";
import { BonusOptions } from "@/components/plan/reference/bonus-options";
import { CarsSection } from "@/components/plan/reference/cars";
import { MeridianAgreements } from "@/components/plan/reference/meridian-agreements";
import { PlanChecklist } from "@/components/budget/plan-checklist";

export const dynamic = "force-dynamic";

const TOC = [
  ["#income", "What comes in"],
  ["#budget", "The budget"],
  ["#card", "April's card"],
  ["#futures", "Three futures"],
  ["#bonus", "The bonus"],
  ["#cars", "The cars"],
  ["#agreements", "The Meridian agreements"],
  ["#open", "Still open"],
  ["/tax", "Filing & the W-4 →"],
] as const;

export default function PlanPage() {
  // Both idempotent — no-ops after the first visit.
  seedHouseholdLinesIfEmpty();
  seedHouseholdPlanTasksOnce();
  const config = getHouseholdConfig();
  const lines = getHouseholdLines();
  const planItems = getActionPlanItems();

  return (
    <div className="flex flex-col h-screen">
      <header className="px-8 py-6 border-b border-border bg-card/50">
        <h1 className="text-2xl font-bold tracking-tight">April and AJ&apos;s Plan</h1>
        <p className="text-sm text-muted-foreground max-w-prose">
          The household budget you build together, what it means for the months ahead, and the structure behind it.
          Every number in a box can be changed, every line can be marked his, hers or shared, and both of you see the
          same thing.
        </p>
        <nav className="flex flex-wrap gap-1.5 mt-4">
          {TOC.map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30"
            >
              {label}
            </a>
          ))}
        </nav>
      </header>
      <div className="flex-1 overflow-auto p-4 sm:p-8 space-y-12">
        <HouseholdPlan
          initialLines={lines}
          initialConfig={config}
          budgetNotes={<BudgetNotes />}
          futuresNotes={<FuturesNotes />}
          bonusOptions={<BonusOptions />}
        />
        <div id="cars" className="scroll-mt-4">
          <CarsSection />
        </div>
        <div id="agreements" className="scroll-mt-4">
          <MeridianAgreements />
        </div>
        <section id="open" className="space-y-3 scroll-mt-4">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border pb-2">
            <h2 className="text-lg font-semibold">Still open</h2>
            <p className="text-sm text-muted-foreground flex-1 min-w-[240px]">
              The things that would change the answers above, as tasks. Same checklist as on Budget.
            </p>
          </div>
          <PlanChecklist items={planItems} />
        </section>
      </div>
    </div>
  );
}

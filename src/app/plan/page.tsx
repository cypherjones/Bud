import Link from "next/link";
import { loadPlan, getSavingsBalance } from "@/lib/household/load";
import { getBusinessConfig } from "@/lib/business/config";
import { getActionPlanItems } from "@/lib/actions/action-plan";
import { budgetTotals, futures, cardPayoff } from "@/lib/household/calc";
import { salonMonth, sideMonth } from "@/lib/business/calc";
import { formatCurrencyCompact } from "@/lib/utils/format";
import { PlanPage, SectionHead, TotalsStrip, Total } from "@/components/plan/plan-ui";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const usd = (dollars: number) => formatCurrencyCompact(Math.round(dollars * 100));

export default function PlanOverviewPage() {
  const { config, lines } = loadPlan();
  const business = getBusinessConfig();
  const tasks = getActionPlanItems().filter((t) => t.status !== "completed" && t.status !== "skipped");
  const savingsBalance = getSavingsBalance();

  const totals = budgetTotals(lines, config.income);
  const cols = futures(lines, config.income, config.futures.aprilTakeHome);
  const card = lines.find((l) => l.slug === "april_card");
  const payoff = cardPayoff(config.card.balance, config.card.apr, card ? card.amount / 100 : 0, new Date());
  const salon = salonMonth(business.salon);
  const side = sideMonth(business.side);
  const openFor = (link: string) => tasks.filter((t) => t.link === link).length;
  const nextDue = tasks.filter((t) => t.dueAt).sort((a, b) => a.dueAt!.localeCompare(b.dueAt!))[0];

  const household: Tile[] = [
    { href: "/budget", title: "The budget", stat: usd(totals.net), tone: totals.net < 0 ? "neg" : "pos",
      line: `left over a month across ${lines.length} lines` },
    { href: "/plan/card", title: "April's card", stat: payoff.kind === "ok" ? payoff.paidOffBy.toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—",
      line: payoff.kind === "ok" ? `paid off, ${payoff.months} months at ${usd(card!.amount / 100)}` : "no payoff at the current payment" },
    { href: "/plan/futures", title: "Three futures", stat: usd(cols[2].left), tone: cols[2].left < 0 ? "neg" : "pos",
      line: `a month if April brings home ${usd(config.futures.aprilTakeHome)}` },
    { href: "/plan/bonus", title: "The bonus", stat: savingsBalance === null ? "—" : usd(savingsBalance),
      line: "left in savings after the Apple Card payoff on 28 Oct" },
    { href: "/plan/cars", title: "The cars", stat: `${openFor("/plan/cars")}`, line: openFor("/plan/cars") === 1 ? "open question before deciding" : "open questions before deciding" },
    { href: "/plan/open", title: "Still open", stat: `${tasks.length}`,
      line: nextDue ? `tasks · next due ${new Date(nextDue.dueAt! + "T12:00:00").toLocaleDateString("en-US", { day: "numeric", month: "short" })}` : "tasks" },
  ];
  const businesses: Tile[] = [
    { href: "/plan/salon", title: "April's salon", stat: usd(salon.takeHome), tone: salon.takeHome < 0 ? "neg" : undefined,
      line: `hers to spend a month, ${business.salon.clientsPerWeek} clients a week` },
    { href: "/plan/side-hustles", title: "Side hustles", stat: usd(side.takeHome), tone: side.gap > 0 ? "neg" : "pos",
      line: `a month against the ${usd(business.side.goal)} goal` },
    { href: "/plan/meridian", title: "Meridian", stat: `${openFor("/plan/meridian")}`,
      line: "closed 27 Oct · tasks for the dissolution and final return" },
  ];

  return (
    <PlanPage
      title="April and AJ's Plan"
      sub="The household budget you build together, what it means for the months ahead, and the businesses behind it. Every page saves for both of you."
    >
      <TotalsStrip cols={4}>
        <Total href="/budget" label="Money in" value={usd(totals.moneyIn)} note="AJ's pay and Simon and Frank" />
        <Total href="/budget" label="Bills" value={usd(totals.out)} note={`AJ ${usd(totals.his)} · April ${usd(totals.hers)} · shared ${usd(totals.both)}`} />
        <Total href="/budget" label="Into savings" value={usd(totals.savings)} note={savingsBalance === null ? "—" : `${usd(savingsBalance)} saved now`} />
        <Total href="/budget" label="Left over" value={usd(totals.net)} tone={totals.net >= 0 ? "text-emerald-400" : "text-red-400"} note="A month, after everything" />
      </TotalsStrip>

      <section className="space-y-3">
        <SectionHead title="The household" sub="The budget and what follows from it." />
        <Tiles tiles={household} />
      </section>

      <section className="space-y-3">
        <SectionHead title="The businesses" sub="April's chair, AJ's apps and consulting, and what's left of Meridian." />
        <Tiles tiles={businesses} />
      </section>

      <p className="text-xs text-muted-foreground">
        Filing jointly or separately, and the W-4, are on <Link href="/tax" className="underline decoration-dotted underline-offset-2">Tax</Link>.
      </p>
    </PlanPage>
  );
}

type Tile = { href: string; title: string; stat: string; line: string; tone?: "neg" | "pos" };

function Tiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border">
      {tiles.map((t) => (
        <Link key={t.href} href={t.href} className="group bg-card px-4 py-4 hover:bg-accent/40 transition-colors">
          <p className="text-sm font-semibold flex items-center justify-between">
            {t.title}
            <span className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">→</span>
          </p>
          <p className={cn("mt-1 text-2xl font-semibold font-mono tabular-nums", t.tone === "neg" && "text-red-400", t.tone === "pos" && "text-emerald-400")}>
            {t.stat}
          </p>
          <p className="text-xs text-muted-foreground">{t.line}</p>
        </Link>
      ))}
    </div>
  );
}

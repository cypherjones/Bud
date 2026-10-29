import { Card, CardContent } from "@/components/ui/card";
import { Aside } from "@/components/plan/plan-ui";
import { formatCurrencyCompact } from "@/lib/utils/format";

const usd = (dollars: number) => formatCurrencyCompact(Math.round(dollars * 100));

/** One car note: the balance and rate come from the debts table, the payment from the budget line. */
export type CarLoan = {
  payment: number; // dollars a month, from the plan line
  balance: number | null; // dollars, estimated from bank payments
  apr: number | null; // percent
};

export type CarsData = {
  maverick: CarLoan;
  tiguan: CarLoan;
  insurance: number; // dollars a month
  fuel: number;
  transport: number; // the whole Transportation group
};

function loanFacts(lender: string, l: CarLoan): string {
  const bal = l.balance === null ? "Balance not tracked on Debts" : `Balance about ${usd(l.balance)}, estimated from bank payments`;
  const apr = l.apr === null ? "" : `, at ${l.apr.toFixed(2)}% APR`;
  return `${lender}. ${bal}${apr}.`;
}

export function CarsSection({ data }: { data: CarsData }) {
  const { maverick, tiguan, insurance, fuel, transport } = data;
  const notes = maverick.payment + tiguan.payment;

  const rows: Array<{ vehicle: string; payment: string; known: string; unknown: string; total?: boolean }> = [
    {
      vehicle: "Ford Maverick",
      payment: usd(maverick.payment),
      known: `${loanFacts("Bridgecrest", maverick)} The largest single payment in the budget.`,
      unknown: "Current market value, so whether selling clears the note or leaves a shortfall.",
    },
    {
      vehicle: "VW Tiguan",
      payment: usd(tiguan.payment),
      known: `${loanFacts("Bridgecrest", tiguan)} The budget line says Seth takes it over from November, once that is confirmed.`,
      unknown: "Whether Seth has confirmed, and whether the loan moves to his name or stays on AJ's credit.",
    },
    {
      vehicle: "Suzuki",
      payment: usd(0),
      known: "Paid off. Free to sell, keep or hand on.",
      unknown: "What it's worth, and whether it's reliable enough to be a main car.",
    },
    {
      vehicle: "Together",
      payment: usd(notes),
      known: `Plus ${usd(insurance)} insurance and ${usd(fuel)} fuel. ${usd(transport)} a month of transport in the budget.`,
      unknown: "Whether seven people can get around in the Maverick and the Suzuki once the Tiguan goes to Seth.",
      total: true,
    },
  ];

  const options = [
    {
      label: "Option A",
      title: "Keep both notes, change nothing",
      body: `${usd(notes)} a month in notes. No transaction costs and no risk of being upside down. The Tiguan's rate keeps running for as long as it stays on the household.`,
    },
    {
      label: "Option B",
      title: "Hand the Tiguan to Seth",
      body: `What the budget line assumes from November. It takes ${usd(tiguan.payment)} a month off the household once confirmed. If the loan stays in AJ's name, a late payment still lands on AJ's credit, so it is worth settling whether Seth refinances it into his own.`,
    },
    {
      label: "Option C",
      title: "Sell or trade the Maverick",
      body: `Frees ${usd(maverick.payment)} a month if the truck is worth at least the balance${maverick.balance === null ? "" : ` of about ${usd(maverick.balance)}`}; otherwise it needs cash to cover the difference. A payoff quote and a valuation come first.`,
    },
  ];

  return (
    <section className="space-y-4">
      <div className="border-b border-border pb-2">
        <h2 className="text-lg font-semibold">The cars</h2>
        <p className="text-sm text-muted-foreground">
          Neither car has been valued against a payoff quote yet. This is what&apos;s known and what would have to be found out.
        </p>
      </div>

      <Card>
        <CardContent className="pt-4">
          {/* Phone: one card per vehicle */}
          <div className="space-y-3 sm:hidden">
            {rows.map((r) => (
              <div key={r.vehicle} className="border-b border-border pb-3 last:border-0 last:pb-0 text-sm">
                <p className="flex items-baseline justify-between gap-3 font-semibold">
                  {r.vehicle}
                  <span className="tabular-nums">{r.payment}</span>
                </p>
                <p className="mt-1 text-muted-foreground">{r.known}</p>
                <p className="mt-1 text-muted-foreground">
                  <span className="text-[11px] font-semibold uppercase tracking-wide">Not known: </span>
                  {r.unknown}
                </p>
              </div>
            ))}
          </div>
          <table className="hidden sm:table w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 text-left font-semibold">Vehicle</th>
                <th className="py-2 px-3 text-right font-semibold">Payment</th>
                <th className="py-2 px-3 text-left font-semibold">Known</th>
                <th className="py-2 pl-3 text-left font-semibold">Not known</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.vehicle} className="border-b border-border last:border-0 align-top">
                  <td className="py-2 pr-3">{r.total ? <b>{r.vehicle}</b> : r.vehicle}</td>
                  <td className="py-2 px-3 tabular-nums text-right">{r.total ? <b>{r.payment}</b> : r.payment}</td>
                  <td className="py-2 px-3 text-muted-foreground">{r.known}</td>
                  <td className="py-2 pl-3 text-muted-foreground">{r.unknown}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Aside tone="warn" title="Both October payments were late">
        <p>
          Both Bridgecrest payments were due on 16 October and were paid on 29 October. November&apos;s are due on the 16th.
        </p>
      </Aside>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {options.map((o) => (
          <Card key={o.label}>
            <CardContent className="space-y-2 pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{o.label}</p>
              <h3 className="text-sm font-semibold">{o.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{o.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed max-w-prose">
        <b className="text-foreground">Insurance:</b> Geico is {usd(insurance)} a month in the budget, covering AJ only.
        Requoting with April as the primary insured was estimated in October at around $70 a month less, because her score is
        higher. That requote is still an open task.
      </p>
    </section>
  );
}

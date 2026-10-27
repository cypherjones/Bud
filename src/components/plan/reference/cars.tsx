import { Card, CardContent } from "@/components/ui/card";

const ROWS: Array<{ vehicle: string; payment: string; known: string; unknown: string; total?: boolean }> = [
  {
    vehicle: "Ford Maverick",
    payment: "781",
    known: "Balance around $27,940. The largest single payment in the budget.",
    unknown: "Current market value, so whether selling clears the note or leaves a shortfall.",
  },
  {
    vehicle: "VW Tiguan",
    payment: "441",
    known: "Balance around $15,515 at about 24% APR.",
    unknown: "Value, and whether a refinance is available at April’s score.",
  },
  {
    vehicle: "Suzuki",
    payment: "0",
    known: "Paid off. Free to sell, keep or hand on.",
    unknown: "What it’s worth, and whether it’s reliable enough to be the third car.",
  },
  {
    vehicle: "Together",
    payment: "1,222",
    known: "Plus $450 insurance and $400 fuel. About $2,072 a month of transport.",
    unknown: "Whether seven people can actually move in two vehicles.",
    total: true,
  },
];

const OPTIONS = [
  {
    label: "Option A",
    title: "Keep all three, change nothing",
    body: "$1,222 a month in notes. No transaction costs, no risk of being upside down, no disruption during a move and a new school year. The 24% on the Tiguan keeps running.",
  },
  {
    label: "Option B",
    title: "Sell one note, keep the Suzuki",
    body: "Frees $441 or $781 a month. Requires the car to be worth at least the balance, or cash to cover the difference. Seven people in two vehicles is the question to answer first.",
  },
  {
    label: "Option C",
    title: "Trade both for one larger paid-down vehicle",
    body: "The thing that actually fits seven. Also the option where negative equity from two loans gets rolled into one new loan, which is how payments go up rather than down. Needs both payoff quotes and both trade values before it can be judged.",
  },
];

export function CarsSection() {
  return (
    <section className="space-y-4">
      <div className="border-b border-border pb-2">
        <h2 className="text-lg font-semibold">The cars</h2>
        <p className="text-sm text-muted-foreground">
          Three vehicles, two notes, seven people. Nobody has priced the actual options yet — this is what’s known
          and what would have to be found out.
        </p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 text-left font-semibold">Vehicle</th>
                  <th className="py-2 px-3 text-right font-semibold">Payment</th>
                  <th className="py-2 px-3 text-left font-semibold">Known</th>
                  <th className="py-2 pl-3 text-left font-semibold">Not known</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.vehicle} className="border-b border-border last:border-0 align-top">
                    <td className="py-2 pr-3">{r.total ? <b>{r.vehicle}</b> : r.vehicle}</td>
                    <td className="py-2 px-3 tabular-nums text-right">{r.total ? <b>{r.payment}</b> : r.payment}</td>
                    <td className="py-2 px-3 text-muted-foreground">{r.known}</td>
                    <td className="py-2 pl-3 text-muted-foreground">{r.unknown}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {OPTIONS.map((o) => (
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
        <b className="text-foreground">The one free move on this list:</b> the insurance is $450 a month, priced partly on his
        credit. April’s score is materially higher. Requoting with her as the primary insured costs nothing to find
        out and was estimated at around $70 a month.
      </p>
    </section>
  );
}

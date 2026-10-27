import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>;
}

function Ledger({ rows }: { rows: Array<{ label: string; value: string; tone?: "pos"; total?: boolean }> }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className={r.total ? "border-t border-border font-semibold" : ""}>
            <td className={`py-1 ${r.total ? "" : "text-muted-foreground"}`}>{r.label}</td>
            <td className={`py-1 tabular-nums text-right ${r.tone === "pos" ? "text-emerald-400" : ""}`}>{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function BonusOptions() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardContent className="space-y-2 pt-4">
          <Label>Use it as</Label>
          <h3 className="text-sm font-semibold">Cash held in reserve</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This is what already happened — $5,600 is sitting in 360 Performance Savings, which matches the bonus
            after tax and tithe to within $17. Financial Peace calls it the storm rule: while the income is uncertain,
            cash on hand beats debt paid off, because cash can be un-spent and a payoff cannot. The business account
            runs dry about 29 October, which is the event this cash is covering.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 pt-4">
          <Label>Use it on</Label>
          <h3 className="text-sm font-semibold">The ring buyout — $1,346.41</h3>
          <Ledger
            rows={[
              { label: "Avoids", value: "3,197.70" },
              { label: "Saves", value: "1,851.29", tone: "pos" },
              { label: "Frees every month", value: "336.60", total: true },
            ]}
          />
          <p className="text-sm text-muted-foreground leading-relaxed">
            A lease-to-own contract charges 2.38× the item price. Buying out early declines the markup rather than
            paying a debt faster. The discount expires 8 October.
          </p>
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-red-500/60">
        <CardContent className="space-y-2 pt-4">
          <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30">
            Ruled out
          </Badge>
          <h3 className="text-sm font-semibold">Phones — paying off the devices</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Carrier discounts arrive as monthly bill credits spread across the contract, and paying the device off
            early stops them. Verizon names early payoff as a change where “your promo credits stop.” So paying off a
            subsidised phone means buying out a subsidy you were already getting for free — the payoff quote is the
            price of giving up the discount, not a saving.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Worth revisiting only if these particular devices turn out to carry no promotional credits, which the
            carrier can confirm in one call.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 pt-4">
          <Label>Use it on</Label>
          <h3 className="text-sm font-semibold">April’s card, or the smallest debts</h3>
          <Ledger
            rows={[
              { label: "Frees every month", value: "small" },
              { label: "Changes credit picture", value: "yes" },
            ]}
          />
          <p className="text-sm text-muted-foreground leading-relaxed">
            Her card was cleared with her aunt’s $2,000. The remaining small balances mostly free very little per
            month but do affect credit, which affects the insurance quote and any car refinance.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/format";

const usd2 = (dollars: number) => formatCurrency(Math.round(dollars * 100));

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>;
}

/** What the bonus did, and the options that were weighed. Amounts come from the plan; dated facts say so. */
export function BonusOptions({
  savings,
  gap,
  ringMonthly,
  ringBuyoutCost,
  aprilCardBalance,
}: {
  savings: number | null; // dollars across counted savings accounts
  gap: number; // the real monthly shortfall, budgetTotals().net as a positive number (0 if none)
  ringMonthly: number;
  ringBuyoutCost: number;
  aprilCardBalance: number;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="border-l-4 border-l-emerald-500/60">
        <CardContent className="space-y-2 pt-4">
          <Label>What happened</Label>
          <h3 className="text-sm font-semibold">It paid off the Apple Card</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The bonus was banked in 360 Performance Savings after tax and tithe. On 28 October $2,651.20 moved out of that
            account and paid the Apple Card off in full, so in effect the bonus went to that debt.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {savings === null
              ? "No savings account is synced, so what is left can't be shown."
              : gap > 0
                ? `The savings accounts now hold ${usd2(savings)}, against a monthly gap of ${usd2(gap)}. There is no reserve left to cover it.`
                : `The savings accounts now hold ${usd2(savings)}.`}
          </p>
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-red-500/60">
        <CardContent className="space-y-2 pt-4">
          <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30">
            Expired
          </Badge>
          <h3 className="text-sm font-semibold">The ring buyout</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Buying the ring out early for {usd2(ringBuyoutCost)} would have ended the lease payments. That discount expired
            on 8 October. The ring stays in the budget as a Rare Carat lease line at {usd2(ringMonthly)} a month.
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
          <Label>Still owed</Label>
          <h3 className="text-sm font-semibold">April&apos;s card</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {aprilCardBalance > 0
              ? `${usd2(aprilCardBalance)}, as entered on the card page. It is paid from salon revenue, not from the bonus.`
              : "No balance is entered on the card page."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

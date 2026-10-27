import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const B = "text-foreground";

export function W4Explainer() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">What a W-4 actually is, in plain terms</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            A W-4 is a form you give your employer that tells them how much tax to hold back from each paycheck. It
            is <b className={B}>a guess, not a bill.</b> The real bill is settled once a year when the return is filed.
            If the guess was too high you get a refund; if it was too low you write a cheque.
          </p>
          <p>Three things make that guess too high here, and none of them are anybody’s fault:</p>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-border align-top">
                <td className="py-2 pr-4 font-semibold text-foreground whitespace-nowrap">Children</td>
                <td className="py-2">
                  Each child under 17 is worth $2,200 off the final bill. If the form doesn’t say how many there are,
                  payroll withholds as though there were none.
                </td>
              </tr>
              <tr className="border-b border-border align-top">
                <td className="py-2 pr-4 font-semibold text-foreground whitespace-nowrap">Meridian</td>
                <td className="py-2">
                  The $3,750 a month from the business is income too, and nothing is withheld from it. It carries its
                  own tax that the paycheck has to cover.
                </td>
              </tr>
              <tr className="align-top">
                <td className="py-2 pr-4 font-semibold text-foreground whitespace-nowrap">The old balance</td>
                <td className="py-2">
                  There is an IRS payment plan from before the marriage with about $12,533 left. Any refund goes there
                  first rather than to the bank.
                </td>
              </tr>
            </tbody>
          </table>
          <p>
            So the question on this page is not “how much tax do we owe” — that is fixed by the rules. It is{" "}
            <b className={B}>when we hand it over</b>: a bit from every paycheck now, or less now and settle up in the
            spring. Both end in the same place. The difference is how much cash is in the house between now and then.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            The $3,750 a month is a guaranteed payment, and it is fully taxable to him.
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            In a partnership, a payment set without regard to whether the business earns anything is a guaranteed
            payment under section 707(c). IRS Publication 541 says plainly what happens when the business is losing
            money: “If guaranteed payments to a partner result in a partnership loss in which the partner shares, the
            partner must report the full amount of the guaranteed payments as ordinary income.” Meridian has no
            revenue, so that is exactly the situation. On top of the income tax, guaranteed payments for services carry{" "}
            <b className={B}>self-employment tax</b> — section 1402(a)(13) preserves that even for limited partners.
          </p>
          <p>
            So $45,000 a year of income has been sitting outside every tax estimate, along with about{" "}
            <b className={`${B} tabular-nums`}>$4,112</b> of self-employment tax that nothing is withholding for. The
            401(k) works the other way — $239.32 a check is $5,744 a year that reduces taxable wages. Both are now in
            the figures below.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export function W4Caveats() {
  return (
    <Card>
      <CardContent className="space-y-3 pt-4 text-sm text-muted-foreground leading-relaxed">
        <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30">
          One thing that applies to all three
        </Badge>
        <p>
          The IRS is explicit that while on an installment agreement you must{" "}
          <b className={B}>file on time and pay each new year in full and on time</b>, and that failing to do so is a
          default. Separately, <b className={B}>refunds are applied to the balance in addition to the monthly payment</b>,
          not instead of it — so making all scheduled payments is still required even when a refund gets taken.
          Under-withholding badly enough to owe at filing is the specific way a W-4 change could break the agreement.
        </p>
        <p>
          There is one more piece that none of the options above covers:{" "}
          <b className={B}>no one is withholding anything against the self-employment tax on the guaranteed payments</b> —
          $5,299 as things stand today, or $4,112 if the agreement is changed. A W-4 can cover it through extra
          withholding on the wage job, or it can be paid as quarterly estimated tax, but it does have to be paid.
          Moving Meridian to an S-corp, which is already the plan, changes this calculation again — wages from an
          S-corp are withheld on, and distributions above a reasonable salary are not subject to self-employment tax at
          all.
        </p>
        <p>
          <b className={B}>What a corrected form looks like, line by line:</b> Step 1(c) married filing jointly · Step 2
          box (c) left unchecked, because that box assumes two similar W-2 incomes and April is self-employed · Step 3
          at $6,600 for three children · Step 4(c) set to whatever number you both pick above · work state Texas.
        </p>
      </CardContent>
    </Card>
  );
}

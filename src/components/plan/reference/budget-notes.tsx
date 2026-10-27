import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function Src({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="underline underline-offset-2 hover:text-foreground" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

export function BudgetNotes() {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-4">
          <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
            These may be deductible — but only with one piece of paper
          </Badge>
          <h3 className="text-sm font-semibold">
            Partnership costs paid personally are a real deduction. Employee costs are not.
          </h3>
          <div className="space-y-3 text-sm text-muted-foreground leading-relaxed max-w-prose">
            <p>
              These are two different rules and they are easy to run together. <b className="text-foreground">Navusoft is a W-2 job</b>,
              and unreimbursed employee expenses are gone — section 67(h) eliminated them and the Form 2106
              instructions say plainly that employees outside four narrow categories “may not use the Form 2106
              due to the termination of miscellaneous itemized deductions.”
            </p>
            <p>
              <b className="text-foreground">Meridian is a partnership, and that is a different rule entirely.</b> The Schedule E
              instructions say: “You can deduct unreimbursed ordinary and necessary partnership expenses you paid on
              behalf of the partnership{" "}
              <b className="text-foreground">if you were required to pay these expenses under the partnership agreement</b>.” Reported
              as UPE on line 28, it reduces income tax and self-employment income both.
            </p>
            <p>
              That condition is the whole thing. Paying them isn’t enough — the agreement has to require it.
              Amending Meridian’s operating agreement to say partners bear certain costs personally, signed by both
              partners, turns <b className="text-foreground tabular-nums">$466.13</b> a month of software into a deduction. Add a home
              office, phone and mileage and the figure is larger.{" "}
              <b className="text-foreground">On the software alone that is worth roughly $2,500 of tax and recovered credits</b>, and it
              has to be done before the 2026 partnership return is filed.
            </p>
            <p className="text-xs">
              <Src href="https://www.irs.gov/instructions/i1040se">Schedule E instructions</Src> ·{" "}
              <Src href="https://www.law.cornell.edu/uscode/text/26/761">26 U.S.C. §761(c)</Src> (amending an agreement for a
              past year) ·{" "}
              <Src href="https://www.irs.gov/instructions/i2106">Form 2106 instructions</Src> (why the W-2 side doesn’t work)
            </p>
          </div>
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground leading-relaxed max-w-prose">
        <b className="text-foreground">The software figures are exact, not estimated.</b> Every line above is a real charge from the
        account feeds, with the date and account it hit. They total <b className="text-foreground tabular-nums">$409.19</b> a month
        across Chime, Capital One 360 and Navy Federal — three personal accounts. Kinsta is Simon’s and is moving to
        him, which takes $122.36 off. Pantheon at $44.16 is still unaccounted for.
      </p>
    </div>
  );
}

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getHouseholdLines } from "@/lib/household/lines";
import { formatCurrency } from "@/lib/utils/format";

const usd2 = (dollars: number) => formatCurrency(Math.round(dollars * 100));

function Src({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="underline underline-offset-2 hover:text-foreground" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

/** Notes under the budget. Server-only: reads the software lines so the totals match the budget above. */
export function BudgetNotes() {
  const software = getHouseholdLines().filter((l) => /software/i.test(l.groupName));
  const total = software.reduce((s, l) => s + l.amount / 100, 0);
  const ending = software.filter((l) => /ends? after/i.test(l.note ?? ""));
  const endingTotal = ending.reduce((s, l) => s + l.amount / 100, 0);
  const names = (ls: typeof software) => ls.map((l) => `${l.label} ${usd2(l.amount / 100)}`).join(", ");

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-4">
          <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30">
            Meridian closed on 27 October
          </Badge>
          <h3 className="text-sm font-semibold">The software lines are personal costs now.</h3>
          <div className="space-y-3 text-sm text-muted-foreground leading-relaxed max-w-prose">
            <p>
              Meridian paid its final draw on 27 October. Anything charged after that is a household cost, whatever it was
              used for.
            </p>
            <p>
              While the company ran, these charges were not deductible either. Schedule E allows a partner to deduct
              partnership expenses paid personally only “if you were required to pay these expenses under the partnership
              agreement,” and Meridian&apos;s agreements never required it. What, if anything, that means for 2026 is a
              question for whoever prepares the final 1065.
            </p>
            <p>
              <b className="text-foreground">Navusoft is a W-2 job</b>, and unreimbursed employee expenses are not
              deductible: section 67(h) suspended them, and the Form 2106 instructions limit that form to four narrow
              categories of employee. If any of these tools now serve AJ&apos;s apps or consulting, they are costs of that
              business and belong with it on the side-hustles page.
            </p>
            <p className="text-xs">
              <Src href="https://www.irs.gov/instructions/i1040se">Schedule E instructions</Src> ·{" "}
              <Src href="https://www.irs.gov/instructions/i2106">Form 2106 instructions</Src>
            </p>
          </div>
        </CardContent>
      </Card>
      {software.length > 0 && (
        <p className="text-sm text-muted-foreground leading-relaxed max-w-prose">
          <b className="text-foreground">The software lines total <span className="tabular-nums">{usd2(total)}</span> a month</b>{" "}
          ({names(software)}).
          {ending.length > 0 && (
            <>
              {" "}
              {names(ending)} {ending.length === 1 ? "is" : "are"} marked to end after November, which takes{" "}
              <span className="tabular-nums">{usd2(endingTotal)}</span> off from December.
            </>
          )}
        </p>
      )}
    </div>
  );
}

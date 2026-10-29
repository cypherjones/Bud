import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyCompact } from "@/lib/utils/format";

const OPEN_TONE = "bg-amber-500/15 text-amber-400 border-amber-500/30";
const B = "text-foreground";

function Src({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="underline underline-offset-2 hover:text-foreground" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function Ledger({ rows }: { rows: Array<{ label: string; value: string; dim?: boolean; total?: boolean }> }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className={r.total ? "border-t border-border font-semibold" : ""}>
            <td className={`py-1 pr-3 ${r.dim ? "text-muted-foreground" : ""}`}>{r.label}</td>
            <td className={`py-1 tabular-nums text-right whitespace-nowrap ${r.dim ? "text-muted-foreground" : ""}`}>
              {r.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const QUESTIONS: Array<{ q: string; where: React.ReactNode; who: string }> = [
  {
    q: "How is the company dissolved?",
    where: (
      <>
        Start with what the <b className={B}>Operating Agreement</b> says about dissolution and winding up, including who
        has to consent. Then the <b className={B}>Georgia</b> filing that ends the LLC, since it was formed there. Final
        bills get paid first, and whatever is left goes out as the agreement directs.
      </>
    ),
    who: "You and Simon as Managing Members, with whoever formed it",
  },
  {
    q: "When is the final 1065 due, and who prepares it?",
    where: (
      <>
        A partnership&apos;s return is due on the 15th day of the third month after its tax year ends, and a closing
        company&apos;s tax year ends when it finishes winding up. If that is late October or November, the{" "}
        <b className={B}>final 1065 and final K-1s are due in mid-January or mid-February 2027</b>, not 15 March. Late
        returns are penalised per partner per month, so engage the preparer now and confirm the date with them.
      </>
    ),
    who: "The 1065 preparer",
  },
  {
    q: "Capital interest or profits interest?",
    where: (
      <>
        Ask for the <b className={B}>capital account balances</b> as booked at formation. If his opening capital account
        was credited with $205,882, it was treated as a capital interest and the value was meant to be income. If it was
        booked at $0 with only Seth&apos;s $100,000 in capital, it was treated as a profits interest. Then ask the drafter
        directly: “was this intended as a profits interest under Rev. Proc. 93-27, and was anything filed to document
        it?” Also check whether any <b className={B}>83(b) election</b> was ever mailed to the IRS. If one was, there will
        be a stamped copy and a certified-mail receipt from around March 2026.
      </>
    ),
    who: "The lawyer or service that drafted the agreements, plus whoever keeps the books",
  },
  {
    q: "His actual outside basis",
    where: (
      <>
        The final K-1 shows the capital account in <b className={B}>Part II, Item L</b>, and the preparer keeps a separate
        basis worksheet. Before then, ask the bookkeeper for the capital account detail through the close: opening
        balance, contributions, guaranteed payments, and allocated loss. Basis comes from cash and property contributed,
        and services contribute neither, so the expected answer is “near zero.”
      </>
    ),
    who: "Whoever keeps Meridian's books; then the 1065 preparer",
  },
];

/** Meridian is closed (final draw 27 Oct 2026). `guaranteedPayments` is the /tax figure, in dollars. */
export function MeridianAgreements({ guaranteedPayments }: { guaranteedPayments: number }) {
  const gp = formatCurrencyCompact(Math.round(guaranteedPayments * 100));
  return (
    <section className="space-y-4">
      <Card className="border-l-4 border-l-amber-500/60">
        <CardContent className="space-y-3 pt-4 text-sm text-muted-foreground leading-relaxed">
          <Badge variant="outline" className={OPEN_TONE}>
            Closed on 27 October
          </Badge>
          <h3 className="text-sm font-semibold text-foreground">What is left is the dissolution and the final return.</h3>
          <p>
            Meridian paid its final draw on 27 October 2026. Anything charged after that is a household cost, not the
            company&apos;s. Two things remain: dissolving the LLC properly, and filing a final 2026 Form 1065, marked final,
            with final K-1s for all three members. The closing date sets when that return is due, and it is likely to be
            earlier than 15 March. The questions at the bottom say where each answer lives.
          </p>
          <p>
            The /tax page carries <b className={`${B} tabular-nums`}>{gp}</b> of guaranteed payments to AJ for 2026. That
            figure was projected in September; the final books replace it.
          </p>
        </CardContent>
      </Card>

      <div className="border-b border-border pb-2">
        <h2 className="text-lg font-semibold">What the Meridian agreements say</h2>
        <p className="text-sm text-muted-foreground">
          A.S. Infinite Solutions &amp; Intelligence LLC, a Georgia LLC. The signed Operating Agreement is effective
          27 February 2026 and was executed by all three members on 3 March 2026; the Investors Agreement is dated
          25 February 2026.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Who owns what</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Ledger
              rows={[
                { label: "Ashaun Jones", value: "3,500,000 units · 35%" },
                { label: "Simon Jones", value: "3,500,000 units · 35%" },
                { label: "Seth Heath", value: "1,700,000 units · 17%" },
                { label: "Reserve pool, unissued", value: "1,300,000 units · 13%", dim: true },
              ]}
            />
            <p className="text-sm text-muted-foreground leading-relaxed">
              Ashaun and Simon are the Managing Members, jointly. Seth is an investor rather than an operator, and he
              has to agree in writing before new equity is issued, the company is sold, debt goes above $100,000, or
              the agreement is changed in a way that affects his interest.{" "}
              <b className={B}>His share of everything is 35%, not half</b> — which is why his share of the projected loss
              below is $43,578 rather than $62,255.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Where the money in the account came from</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Ledger
              rows={[
                { label: "Seth Heath, cash for 17%", value: "100,000.00" },
                { label: "Ashaun, sweat equity, stated value", value: "205,882.00" },
                { label: "Simon, sweat equity, stated value", value: "205,882.00" },
                { label: "Cash the company ever actually received", value: "100,000.00", total: true },
              ]}
            />
            <p className="text-sm text-muted-foreground leading-relaxed">
              The business never had revenue, so everything it paid out — the members&apos; draws, the employee, the tools —{" "}
              <b className={B}>came out of Seth&apos;s $100,000</b>. The account held $58,804 on 2 June and $17,135 on
              16 September. The final draw was paid on 27 October.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Where the partnership loss comes from</CardTitle>
          <p className="text-sm text-muted-foreground">
            Projected in September, before the close. The shape holds; the final 1065 replaces the numbers.
          </p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            It isn&apos;t a write-down or an accounting adjustment. A business with no revenue that pays money out has a
            loss exactly equal to what it pays out.
          </p>
          <Ledger
            rows={[
              { label: "Revenue, 2026", value: "0" },
              { label: "Guaranteed payment to him", value: "−37,500" },
              { label: "Guaranteed payment to the other partner", value: "−37,500" },
              { label: "Employee wages and employer payroll tax", value: "−40,371" },
              { label: "Tools and other operating cost", value: "−9,138" },
              { label: "Partnership loss for 2026, projected", value: "−124,509", total: true },
              { label: "His share at 35%", value: "−43,578", dim: true },
            ]}
          />
          <p>
            Guaranteed payments are deductible to the partnership even though they&apos;re taxable to the partner, which is
            why his own payments appear both as income to him and as part of the partnership&apos;s loss. His share arrives
            on the K-1. Whether he can use it depends on his basis.
          </p>
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-amber-500/60">
        <CardContent className="space-y-3 pt-4 text-sm text-muted-foreground leading-relaxed">
          <Badge variant="outline" className={OPEN_TONE}>
            About basis
          </Badge>
          <h3 className="text-sm font-semibold text-foreground">
            Sweat equity does not create tax basis. Without basis, the loss can’t be used.
          </h3>
          <p>
            A partner’s basis is “the amount of money contributed plus the adjusted basis at the time of contribution
            of any property contributed.” Services are not money and not property, so they create no basis.
            Attachment A to the signed agreement lists his <b className={B}>initial contribution</b> as “Sweat equity —
            product development, technical infrastructure, and operational systems valued at $205,882.00.” That is a
            valuation of contributed work, not a capital account funded with cash.
          </p>
          <p>
            That matters because a partner may only deduct losses up to basis. A loss held back for lack of basis
            normally waits for a later year with basis to absorb it, but with the company closed there is no later year,
            and a loss still suspended when the interest is liquidated is generally lost.{" "}
            <b className={B}>Planning should assume his share of the loss is worth nothing</b> until a preparer says
            otherwise, which is why the K-1 loss box on /tax is set to zero.
          </p>
          <p>
            <b className={B}>
              And there is a related question running the other way, where the signed document is worth a careful look.
            </b>{" "}
            Receiving a <i>capital</i> interest for services is generally taxable at its value when received. A{" "}
            <i>profits</i> interest generally is not. Three things in the executed agreement point toward a capital
            interest: Attachment A calls the sweat equity an <b className={B}>“Initial Contribution”</b>; Section III(a)
            fixes his <b className={B}>membership interest at 35 percent</b> from adoption, which shares in existing
            capital on a liquidation; and nowhere does either document use the words “profits interest”, describe a
            vesting schedule for the founders’ units, or limit them to future profits only. There is also no mention
            of an 83(b) election, and the window on one would have closed around 29 March 2026.
          </p>
          <p>
            What that could mean is ordinary income in 2026 on the value of the interest received. What it is actually
            worth is a separate question — the measure is fair market value at grant, not the $205,882 written on the
            page, and with $100,000 of cash in and no revenue a 35% interest may be worth a great deal less than that.{" "}
            <b className={B}>
              This is the most important thing to settle before the final return is filed, and it is a question for a
              tax professional rather than for a page like this.
            </b>
          </p>
          <p className="text-xs">
            <Src href="https://www.law.cornell.edu/cfr/text/26/1.722-1">26 CFR §1.722-1</Src> ·{" "}
            <Src href="https://www.law.cornell.edu/uscode/text/26/704">26 U.S.C. §704(d)</Src> ·{" "}
            <Src href="https://www.irs.gov/newsroom/new-limits-on-partners-shares-of-partnership-losses-frequently-asked-questions">
              IRS: limits on partners’ loss shares
            </Src>{" "}
            · <Src href="https://www.irs.gov/instructions/i1065">Form 1065 instructions</Src> (when the return is due)
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">How to actually find out each of these</CardTitle>
          <p className="text-sm text-muted-foreground">Each one is a specific document or a specific person, not research.</p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          {/* Phone: one block per question */}
          <div className="space-y-3 sm:hidden">
            {QUESTIONS.map((r) => (
              <div key={r.q} className="border-b border-border pb-3 last:border-0 last:pb-0">
                <p className="font-semibold text-foreground">{r.q}</p>
                <p className="mt-1">{r.where}</p>
                <p className="mt-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide">Who: </span>
                  {r.who}
                </p>
              </div>
            ))}
          </div>
          <table className="hidden sm:table w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 text-left font-semibold">Question</th>
                <th className="py-2 px-3 text-left font-semibold">Where the answer lives</th>
                <th className="py-2 pl-3 text-left font-semibold">Who</th>
              </tr>
            </thead>
            <tbody>
              {QUESTIONS.map((r) => (
                <tr key={r.q} className="border-b border-border last:border-0 align-top">
                  <td className="py-2 pr-3 text-foreground font-semibold">{r.q}</td>
                  <td className="py-2 px-3">{r.where}</td>
                  <td className="py-2 pl-3">{r.who}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            All four come down to one conversation with whoever keeps the books, one with whoever drafted the agreements,
            and one with the preparer. They all feed the same final return.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

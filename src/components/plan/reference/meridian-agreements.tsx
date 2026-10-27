import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const OPEN_TONE = "bg-amber-500/15 text-amber-400 border-amber-500/30";
const FACT_TONE = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
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

const STEPS = [
  {
    step: "1",
    what: "One-page amendment to the Operating Agreement with obligating language and named categories. Signed by both Managing Members.",
    when: "Before year end is cleanest",
  },
  {
    step: "2",
    what: "Seth’s written acknowledgment alongside it, because the Investors Agreement asks for his agreement on changes that affect his interests.",
    when: "Same week",
  },
  {
    step: "3",
    what: "One folder of receipts from January onward — the card statements already show every software charge, so this is mostly assembling what exists.",
    when: "Ongoing",
  },
  {
    step: "4",
    what: "Hand the amendment to the 1065 preparer so the K-1 and your Schedule E line up. It goes on line 28 marked “UPE”.",
    when: "Before 15 Mar 2027",
  },
];

export function MeridianAgreements() {
  return (
    <section className="space-y-4">
      <div className="border-b border-border pb-2">
        <h2 className="text-lg font-semibold">What the Meridian agreements actually say</h2>
        <p className="text-sm text-muted-foreground">
          A.S. Infinite Solutions &amp; Intelligence LLC. The signed Operating Agreement is effective 27 February 2026
          and was executed by all three members on 3 March 2026; the Investors Agreement is dated 25 February 2026.
          Three things in them change the numbers above.
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
              <b className={B}>His share of everything is 35%, not half</b> — which is why the partnership loss above is
              $43,578 rather than $62,255.
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
              The business has no revenue. So the $58,804 in June and the $17,135 today are{" "}
              <b className={B}>what is left of Seth’s $100,000</b>. At $11,858 a month it runs out around 29 October.
              That reframes the runway question: it isn’t only about cash. It is also a conversation to have with Seth.
            </p>
          </CardContent>
        </Card>
      </div>

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
            That matters because a partner may only deduct losses up to basis. With little or no basis, the $43,578
            share of the 2026 loss is <b className={B}>held over rather than used now</b> — it carries forward to a later
            year, when there is basis to absorb it.{" "}
            <b className={B}>Planning should assume the loss is worth nothing in 2026</b> until a preparer says otherwise,
            which is why that box on the return above is set to zero.
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
              This is the most important thing to ask about soon, and it is a question for a tax professional rather
              than for a page like this.
            </b>
          </p>
          <p className="text-xs">
            <Src href="https://www.law.cornell.edu/cfr/text/26/1.722-1">26 CFR §1.722-1</Src> ·{" "}
            <Src href="https://www.law.cornell.edu/uscode/text/26/704">26 U.S.C. §704(d)</Src> ·{" "}
            <Src href="https://www.irs.gov/newsroom/new-limits-on-partners-shares-of-partnership-losses-frequently-asked-questions">
              IRS: limits on partners’ loss shares
            </Src>
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="space-y-3 pt-4 text-sm text-muted-foreground leading-relaxed">
            <Badge variant="outline" className={OPEN_TONE}>
              The UPE deduction is not available as the agreements stand
            </Badge>
            <h3 className="text-sm font-semibold text-foreground">
              Neither document requires members to bear costs personally.
            </h3>
            <p>
              Both were read end to end. There is no reimbursement clause, no expense-bearing clause, nothing obliging
              a member to pay company costs out of their own pocket. The Schedule E condition — “if you were required
              to pay these expenses under the partnership agreement” — is not met today, so the $409.19 a month of
              software is currently <b className={B}>not deductible by anyone</b>. The company isn’t paying it and he
              can’t deduct it.
            </p>
            <p>
              Amending the Operating Agreement fixes it, and the agreement allows amendment. One thing to keep in mind:
              the Investors Agreement says the Managing Members cannot change the Operating Agreement “in any manner
              that adversely affects Seth Heath’s rights or economic interests” without his written consent. A clause
              asking members to cover their own tool costs most likely helps the company rather than costing Seth
              anything — but since he is the only one who put cash in, getting his agreement in writing is worth doing
              anyway.
            </p>
            <p>
              <b className={B}>The deadline is 15 March 2027, and it is not extendable.</b> See the card below.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-4 text-sm text-muted-foreground leading-relaxed">
            <Badge variant="outline" className={OPEN_TONE}>
              The draws may be outside the agreement
            </Badge>
            <h3 className="text-sm font-semibold text-foreground">
              Member compensation needs a unanimously approved budget.
            </h3>
            <p>
              The Operating Agreement says the Members may set compensation for a member providing services “subject
              to unanimous approval of an annual operating budget,” and that “all compensation paid to Members must
              fall within the scope of the unanimously approved annual operating budget.”
            </p>
            <p>
              Separately, distributions happen <i>annually</i>, out of 30% of EBITDA. EBITDA is negative, so these
              payments cannot be distributions — they have to be compensation, which puts them squarely under the
              budget clause.
            </p>
            <p>
              <b className={B}>A 2026 budget does exist, and all three Members approved it verbally.</b> That very likely
              satisfies the clause, which requires unanimous approval but does not require it in writing — and the tax
              regulation on partnership agreements accepts oral modifications outright. So this is paperwork rather
              than trouble.
            </p>
            <p>
              It is paperwork worth doing, though. The only record of what was approved is three people’s memory, Seth
              is separately owed “an annual audited report,” and the agreement requires{" "}
              <i>prior unanimous written consent</i> for any base compensation increase above 10%. A one-page consent
              ratifying the verbal approval settles all of it. The card below has the detail.
            </p>
          </CardContent>
        </Card>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed max-w-prose">
        <b className={B}>One more, easy to miss:</b> the company is a <b className={B}>Georgia</b> LLC formed under Georgia
        law, and its registered address is the old Lenox Park apartment. The household has moved to Texas. Operating
        from Texas may require registering there as a foreign LLC, and the registered agent address needs updating
        either way. Worth one question to whoever formed it.
      </p>

      <Card>
        <CardContent className="space-y-3 pt-4 text-sm text-muted-foreground leading-relaxed">
          <Badge variant="outline" className={FACT_TONE}>
            Both of these turn on the same regulation
          </Badge>
          <h3 className="text-sm font-semibold text-foreground">
            For tax purposes, “the partnership agreement” is broader than the signed PDF — and it can still be changed
            for 2026.
          </h3>
          <p>
            26 CFR §1.761-1(c) defines a partnership agreement as “the original agreement and any modifications thereof
            agreed to by all the partners or adopted in any other manner provided by the partnership agreement,” and
            says plainly that <b className={B}>“such agreement or modifications can be oral or written.”</b> It also
            allows a modification made <i>after</i> the year closes to count for that year, so long as it happens “not
            later than the date (not including any extension of time) prescribed by law for the filing of the
            partnership return.”
          </p>
          <p>Two consequences, one for each question.</p>

          <h3 className="pt-2 text-sm font-semibold text-foreground">
            On the verbally approved budget: it probably already counts.
          </h3>
          <p>
            The Operating Agreement requires compensation to fall within “the unanimously approved annual operating
            budget.” It does not say the approval has to be written. The Investors Agreement goes further and says
            Board or Shareholder action “may be evidenced by any writing executed by the requisite number of
            Shareholders, <i>or otherwise, as the Shareholders may agree in writing</i>.” Combined with §1.761-1(c), a
            budget all three of you agreed out loud is a real approval.
          </p>
          <p>
            The issue isn’t tax, it’s simply having a record. If Seth ever disputes what was approved, nobody can
            produce it. And the agreement does require <i>prior unanimous written consent</i> for any base compensation
            increase above 10% — so the written-consent habit has to start somewhere. The fix is one page: a{" "}
            <b className={B}>written consent ratifying the verbal approval</b>, reciting that the 2026 operating budget
            including member compensation of $3,750 per month per Managing Member was approved by all Members on or
            about [date], and confirming it in writing now. Backdating it would be a mistake; ratifying it today is
            normal and correct.
          </p>

          <h3 className="pt-2 text-sm font-semibold text-foreground">
            On the missing reimbursement clause: you have until 15 March 2027.
          </h3>
          <p>
            You do not need a time machine and you do not need to have done it in January. A modification agreed by
            all partners before the unextended 1065 due date counts for the whole of 2026. For a 2026 calendar year
            that date is <b className={B}>15 March 2027</b>, and filing an extension does <b className={B}>not</b> move it.
            Practically, do it well before the preparer starts, not the week of.
          </p>
          <p>
            <b className={B}>What the clause has to say to be worth anything.</b> Schedule E requires that you were{" "}
            <i>required</i> to pay the expense under the agreement. So it has to say Members <b className={B}>must</b> pay
            these costs, not that they <i>may</i> — “Members shall bear”, not “Members may pay”. Name the categories
            rather than saying “expenses”: subscription and software tools used in the Member’s work for the Company; a
            home office maintained at the Member’s own cost; business use of a personally owned phone and internet
            connection; business use of a personal vehicle. And state that the Company{" "}
            <b className={B}>shall not reimburse</b> them, because a cost you could have claimed back and didn’t is not
            deductible.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 text-left font-semibold">Step</th>
                  <th className="py-2 px-3 text-left font-semibold">What it is</th>
                  <th className="py-2 pl-3 text-right font-semibold">By when</th>
                </tr>
              </thead>
              <tbody>
                {STEPS.map((s) => (
                  <tr key={s.step} className="border-b border-border last:border-0 align-top">
                    <td className="py-2 pr-3 tabular-nums text-foreground">{s.step}</td>
                    <td className="py-2 px-3">{s.what}</td>
                    <td className="py-2 pl-3 text-right whitespace-nowrap text-foreground">{s.when}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p>
            <b className={B}>What it’s worth, and why it’s more than it looks.</b> UPE reduces income tax <i>and</i>{" "}
            self-employment income, so each dollar saves roughly 22 cents of income tax plus about 14 cents of SE tax.
            On the $409.19 a month of software alone that’s about <b className={`${B} tabular-nums`}>$1,770</b>. Add a home
            office, the business share of phone and internet, and mileage, and the $700 a month figure becomes
            realistic — worth roughly <b className={`${B} tabular-nums`}>$3,000</b>.
          </p>
          <p className="text-xs">
            <Src href="https://www.law.cornell.edu/cfr/text/26/1.761-1">26 CFR §1.761-1(c)</Src> ·{" "}
            <Src href="https://www.law.cornell.edu/uscode/text/26/761">26 U.S.C. §761(c)</Src> ·{" "}
            <Src href="https://www.irs.gov/instructions/i1040se">Schedule E instructions</Src>
          </p>
          <p>
            <b className={B}>One caution.</b> This only covers <b className={B}>Meridian’s</b> costs. Anything that belongs
            to the Navusoft job stays non-deductible, and mixing the two is the fastest way to lose the whole
            deduction. Keep the software on the Meridian list and the Navusoft expenses on reimbursement requests.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">On the K-1s: nothing is late.</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground leading-relaxed">
          <p>
            The company’s first tax year began 27 February 2026, so its first <b className={B}>Form 1065</b> isn’t due
            until <b className={B}>15 March 2027</b> and the first K-1s come with it. There being none yet is normal, not a
            failure. What matters is that somebody is engaged to prepare that return, because the personal return
            can’t be finished without the K-1 — and a late 1065 is penalised per partner per month, so three members
            makes it expensive quickly.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">How to actually find out each of these</CardTitle>
          <p className="text-sm text-muted-foreground">Each one is a specific document or a specific person, not research.</p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 text-left font-semibold">Question</th>
                  <th className="py-2 px-3 text-left font-semibold">Where the answer lives</th>
                  <th className="py-2 pl-3 text-left font-semibold">Who</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border align-top">
                  <td className="py-2 pr-3 text-foreground font-semibold">Capital interest or profits interest?</td>
                  <td className="py-2 px-3">
                    Ask for the <b className={B}>capital account balances</b> as booked at formation. If his opening
                    capital account was credited with $205,882, it was treated as a capital interest and the value was
                    meant to be income. If it was booked at $0 with only Seth’s $100,000 in capital, it was treated as a
                    profits interest. Then ask the drafter directly: “was this intended as a profits interest under Rev.
                    Proc. 93-27, and was anything filed to document it?” Also check whether any{" "}
                    <b className={B}>83(b) election</b> was ever mailed to the IRS — if one was, there will be a stamped
                    copy and a certified-mail receipt from around March 2026.
                  </td>
                  <td className="py-2 pl-3">The lawyer or service that drafted the agreements, plus whoever keeps the books</td>
                </tr>
                <tr className="border-b border-border align-top">
                  <td className="py-2 pr-3 text-foreground font-semibold">
                    Does a unanimously approved 2026 operating budget exist?
                  </td>
                  <td className="py-2 px-3">
                    Answered — one exists and all three approved it verbally. That is very likely enough: the Operating
                    Agreement does not require the approval to be written, and §1.761-1(c) accepts oral modifications.
                    What is missing is proof, so the task is a <b className={B}>written consent ratifying the verbal
                    approval</b>, dated today, not backdated. See the card above.
                  </td>
                  <td className="py-2 pl-3">You and Simon first, then Seth for signature</td>
                </tr>
                <tr className="border-b border-border align-top">
                  <td className="py-2 pr-3 text-foreground font-semibold">His actual outside basis</td>
                  <td className="py-2 px-3">
                    Normally it comes from <b className={B}>Schedule K-1, Part II, Item L</b> — the capital account
                    rollforward — plus the preparer’s separate basis worksheet. Since the first K-1 is a year away, ask
                    the bookkeeper for the current capital account detail instead: opening balance, contributions,
                    guaranteed payments, and allocated loss to date. The short version is that basis comes from cash and
                    property contributed, and services contribute neither, so the expected answer is “near zero.”
                  </td>
                  <td className="py-2 pl-3">Whoever keeps Meridian’s books; then the 1065 preparer</td>
                </tr>
                <tr className="align-top">
                  <td className="py-2 pr-3 text-foreground font-semibold">Amending the agreement for tool costs</td>
                  <td className="py-2 px-3">
                    This one isn’t a question, it’s a task. A <b className={B}>one-page amendment</b> adding a clause
                    that Members are required to pay specified ordinary and necessary Company expenses personally
                    without reimbursement, signed by both Managing Members. Get Seth’s written acknowledgment alongside
                    it, because the Investors Agreement blocks amendments that adversely affect his interests. Date it
                    before year end and keep receipts for every charge from January onward.
                  </td>
                  <td className="py-2 pl-3">You and Simon sign; Seth acknowledges; the preparer sees it before filing</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Three of the four are answered by one conversation with whoever keeps the books and one with whoever
            drafted the agreements. Worth making both calls in the same week, because all four feed the same 2026
            return.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

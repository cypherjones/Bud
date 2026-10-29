const B = "text-foreground";

function Src({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="underline underline-offset-2 hover:text-foreground" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function Sources({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs text-muted-foreground">{children}</p>;
}

function Fact({ q, children }: { q: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[auto_1fr] gap-3 items-start">
      <span className="mt-[7px] h-[7px] w-[7px] rounded-full bg-emerald-400 flex-none" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{q}</p>
        <div className="mt-1 space-y-2 text-sm text-muted-foreground leading-relaxed">{children}</div>
      </div>
    </li>
  );
}

const CDCC_ROWS = [
  { agi: "150,000 or less", rate: "35.0%", one: "1,050", two: "2,100" },
  { agi: "160,000", rate: "32.3%", one: "970", two: "1,939" },
  { agi: "170,000", rate: "29.6%", one: "889", two: "1,779" },
  { agi: "180,000", rate: "27.0%", one: "809", two: "1,618" },
  { agi: "206,000 or more", rate: "20.0%", one: "600", two: "1,200" },
];

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** The planner's numbers the rules quote, so the prose never drifts from the math. */
export type RulesFigures = { agi: number; herEarned: number; cdcc: number; cdccRate: number; llc: number; tuition: number };

export function FilingRules({ agi, herEarned, cdcc, cdccRate, llc, tuition }: RulesFigures) {
  const llcShare = agi <= 160000 ? 1 : agi >= 180000 ? 0 : (180000 - agi) / 20000;
  return (
    <ul className="flex flex-col gap-5">
          <Fact q="You are married for all of 2026, not part of it.">
            <p>
              The IRS puts it in one line: “Generally, your filing status is based on your marital status on the last
              day of the year.” A September wedding means the whole of 2026 is filed as a married couple, either
              jointly or separately — there is no part-year option the way there is for a state return.
            </p>
            <Sources>
              <Src href="https://www.irs.gov/filing/filing-status">IRS: filing status</Src> ·{" "}
              <Src href="https://www.irs.gov/publications/p501">Publication 501</Src> ·{" "}
              <Src href="https://www.law.cornell.edu/uscode/text/26/7703">26 U.S.C. §7703(a)(1)</Src> ·{" "}
              <Src href="https://www.taxpayeradvocate.irs.gov/news/tax-tips/the-tax-ramifications-of-tying-the-knot/2025/07/">
                Taxpayer Advocate
              </Src>
            </Sources>
            <p>
              <b className={B}>Settled:</b> the marriage is recorded as an informal marriage dated 7 September 2026, so
              2026 is a married year either way.
            </p>
          </Fact>

          <Fact q="April is not liable for tax debt from returns she never signed.">
            <p>
              Joint and several liability — where the IRS can collect the full amount from either spouse — attaches to
              a joint return. It does not reach backward to a return filed before the marriage. The existing
              installment agreement balance is his alone.
            </p>
            <Sources>
              <Src href="https://www.law.cornell.edu/uscode/text/26/6013">26 U.S.C. §6013(d)(3)</Src> ·{" "}
              <Src href="https://www.hrblock.com/tax-center/filing/personal-tax-planning/married-filing-jointly-vs-separately/">
                H&amp;R Block on joint liability
              </Src>
            </Sources>
          </Fact>

          <Fact q="But a joint refund can be taken for that debt. There is a form that stops it.">
            <p>
              If they file jointly and a refund is due, the IRS can apply the whole refund to his past-due federal tax.{" "}
              <b className={B}>Form 8379, Injured Spouse Allocation</b>, asks the IRS to carve out and pay April her share
              instead. It can be filed with the return or afterwards, and takes the IRS up to 8 weeks on its own, longer
              if attached to the return.
            </p>
            <Sources>
              <Src href="https://www.law.cornell.edu/uscode/text/26/6402">26 U.S.C. §6402</Src> (the offset authority) ·{" "}
              <Src href="https://www.irs.gov/instructions/i8379">Form 8379 instructions</Src> ·{" "}
              <Src href="https://www.hrblock.com/tax-center/irs/audits-and-tax-notices/tax-dictionary-injured-spouse/">
                H&amp;R Block: Injured Spouse
              </Src>{" "}
              — note H&amp;R Block’s page lists child support and student loans as the examples but the IRS
              instructions cover “past-due federal tax” explicitly.
            </Sources>
          </Fact>

          <Fact q="Texas being a community property state changes how her share is worked out.">
            <p>
              The IRS divides the refund by Texas community property law rather than by who earned what. This can mean
              April recovers less than a straight “her income, her withholding” split would suggest.
            </p>
          </Fact>

          <Fact q="Filing separately does not keep their incomes apart in Texas.">
            <p>
              This is the part most people don’t expect. In a community property state, spouses filing separately must
              each report <b className={B}>half of all community income</b> — wages and self-employment earnings both —
              plus all of their own separate income, and file <b className={B}>Form 8958</b> showing the split.
              Self-employment tax still falls on whoever runs the business. Separate returns in Texas mean more
              paperwork, not separate finances.
            </p>
            <Sources>
              <Src href="https://www.law.cornell.edu/uscode/text/26/66">26 U.S.C. §66</Src> ·{" "}
              <Src href="https://www.irs.gov/publications/p555">IRS Publication 555</Src> ·{" "}
              <Src href="https://www.hrblock.com/tax-center/filing/personal-tax-planning/tax-requirements-if-married-and-filing-separately/">
                H&amp;R Block on filing separately
              </Src>
            </Sources>
            <p>
              <b className={B}>What “the split” actually means, concretely:</b> Say he earns $128,000 and she earns
              $20,000, and they file separately. Neither return shows what that person earned. Each return shows{" "}
              <b className={B}>half of the combined $148,000 — $74,000 each</b> — because both incomes were earned during
              the marriage while living in Texas. Withholding gets split the same way. Income earned <i>before</i> the
              September wedding, and income earned while he was still domiciled in Georgia, stays separate — which is
              why 2026 in particular would be complicated to file separately: part of the year is community, part
              isn’t, and Form 8958 has to show the line.
            </p>
          </Fact>

          <Fact
            q={
              herEarned > 0
                ? "The childcare credit is live, because April has earned income."
                : "The childcare credit needs April to have earned income, and the planner has her at $0."
            }
          >
            <p>
              The credit is capped by the <i>smaller</i> of the two spouses’ earned income.{" "}
              {herEarned > 0 ? (
                <>
                  With April’s business entered, her earned income is about <b className={B}>{usd(herEarned)}</b>, and the
                  planner gives a credit of <b className={B}>{usd(cdcc)}</b> at {Math.round(cdccRate * 100)}%.
                </>
              ) : (
                <>
                  April’s profit is entered as $0 above, so the ceiling is $0 and so is the credit. Her salon chair is
                  self-employment, and its net profit is earned income: enter it and the credit appears.
                </>
              )}
            </p>
            <p>
              <b className={B}>The credit got better for 2026.</b> The One Big Beautiful Bill lifted the top rate from 35% to
              50% for low incomes. For a joint return the rate holds at <b className={B}>35% up to $150,000 of AGI</b>, then
              slides down to a 20% floor. Expenses are capped at{" "}
              <b className={B}>$3,000 for one qualifying child and $6,000 for two or more</b>.
            </p>
            <div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-2 text-left font-semibold">Joint AGI</th>
                    <th className="py-2 px-2 text-right font-semibold">Rate</th>
                    <th className="py-2 px-2 text-right font-semibold">1 child</th>
                    <th className="py-2 pl-2 text-right font-semibold">2+</th>
                  </tr>
                </thead>
                <tbody>
                  {CDCC_ROWS.map((r) => (
                    <tr key={r.agi} className="border-b border-border last:border-0">
                      <td className="py-1.5 pr-2 text-foreground">{r.agi}</td>
                      <td className="py-1.5 px-2 tabular-nums text-right">{r.rate}</td>
                      <td className="py-1.5 px-2 tabular-nums text-right">{r.one}</td>
                      <td className="py-1.5 pl-2 tabular-nums text-right">{r.two}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-xs">The planner’s AGI is {usd(agi)}.</p>
            </div>
            <p>
              <b className={B}>Elijah qualifies. Neriah probably does not.</b> Care for a child under 13 counts, but school
              tuition from kindergarten up is specifically excluded. Before and after school care does count. So assume
              one qualifying child unless Neriah is under 13 and the $416.67 is care rather than tuition.
            </p>
            <p>
              <b className={B}>A dependent care FSA can beat the credit, from 2027.</b> The limit rose from $5,000 to{" "}
              <b className={B}>$7,500</b> on 1 January 2026, and Elijah’s daycare is $7,488 a year. Run through an FSA it
              comes out before income tax <i>and</i> FICA, about 22% plus 7.65%, so roughly{" "}
              <b className={B}>$2,220 back</b> against about $1,050 from the credit. You cannot use both on the same
              dollars. Marriage allowed a mid-year election only within 30 days of 7 September, and that window has closed,
              so the next chance is <b className={B}>Navusoft’s open enrollment for 2027</b>: ask whether they offer one.
              The FSA is also capped at the lower earner’s earned income, so it needs April’s salon profit on the return too.
            </p>
            <Sources>
              <Src href="https://www.irs.gov/publications/p503">Publication 503</Src> ·{" "}
              <Src href="https://www.law.cornell.edu/uscode/text/26/21">26 U.S.C. §21</Src> ·{" "}
              <Src href="https://www.law.cornell.edu/uscode/text/26/129">26 U.S.C. §129</Src> ·{" "}
              <Src href="https://www.mercer.com/en-us/insights/us-health-news/big-beautiful-bill-permanently-enhances-dependent-care-benefits/">
                Mercer on the OBBBA changes
              </Src>
            </Sources>
          </Fact>

          <Fact q="AJ is enrolled at Harvard Extension, which can mean an education credit.">
            <p>
              The <b className={B}>Lifetime Learning Credit</b> is 20% of up to $10,000 of qualified tuition and fees, so
              up to <b className={B}>$2,000 a year</b>. Unlike the American Opportunity Credit it does not require
              half-time enrolment or a degree programme, and a single course qualifies if it maintains or improves job
              skills.
            </p>
            <p>
              <b className={B}>It phases out with income:</b> for a joint return, between{" "}
              <b className={B}>$160,000 and $180,000 of MAGI</b>. On the planner’s AGI of {usd(agi)}{" "}
              {llcShare >= 1
                ? "the credit is not reduced at all."
                : llcShare <= 0
                  ? "the credit is gone."
                  : `the credit is cut to ${Math.round(llcShare * 100)}% of its full amount, and every dollar of AGI reduction hands some back.`}{" "}
              {tuition > 0
                ? `With ${usd(tuition)} of tuition entered, it is worth ${usd(llc)}.`
                : "No tuition is entered yet, so the planner counts $0."}
            </p>
            <p>
              <b className={B}>What to do:</b> get the <b className={B}>Form 1098-T</b> from Harvard Extension for 2026, and
              total what was actually paid in the calendar year rather than what was billed. Books and supplies only
              count if they must be bought from the institution.
            </p>
            <Sources>
              <Src href="https://www.irs.gov/credits-deductions/individuals/lifetime-learning-credit">
                IRS: Lifetime Learning Credit
              </Src>{" "}
              · <Src href="https://www.irs.gov/forms-pubs/about-publication-970">Publication 970</Src>
            </Sources>
          </Fact>

          <Fact q="Partnership costs he paid personally only count if the agreement made him bear them.">
            <p>
              Unreimbursed partnership expenses (UPE) go on Schedule E line 28, but only when the operating agreement
              requires the partner to pay them and the partnership won’t reimburse. Because the deduction lowers AGI it
              can also lift credits that phase out with income. The second W-4 scenario above prices it from the
              planner’s inputs; no fixed figure is quoted here because the software costs ran through a business account
              Bud stopped syncing in June.
            </p>
            <p>
              <b className={B}>The deadline is the 1065’s, not the 1040’s.</b> Partners can amend the agreement for a year
              up to the original due date of the partnership return. If Meridian terminated with the final draw on 27
              October, that is <b className={B}>15 January 2027</b>; if it is still winding up, 15 March 2027. Confirm with
              your CPA which applies, and whether amending a closed partnership’s agreement is worth it.
            </p>
            <Sources>
              <Src href="https://www.law.cornell.edu/uscode/text/26/761">26 U.S.C. §761(c)</Src> ·{" "}
              <Src href="https://www.law.cornell.edu/uscode/text/26/6072">26 U.S.C. §6072(b)</Src> ·{" "}
              <Src href="https://www.irs.gov/instructions/i1065">Form 1065 instructions</Src>
            </Sources>
          </Fact>

          <Fact q="Tithing in cash gets no tax benefit at all. Changing how it’s paid is worth about $440.">
            <p>
              The rule is strict and there is no exception for small gifts: for <b className={B}>any</b> cash contribution
              “the donor must obtain and keep a bank record or a written communication from the donee as a record.”
              Acceptable records are bank statements, cancelled cheques or card statements showing the date, the
              church’s name and the amount. A donor’s own notes explicitly don’t count. So money that leaves the house
              as physical cash with nothing to show for it is not deductible — not disallowed later, just never
              deductible. At $250 or more in a single gift, a written acknowledgment from the church is also required.
            </p>
            <p>
              <b className={B}>And 2026 is the first year it pays off without itemising.</b> Beginning this tax year,
              taxpayers who take the standard deduction may still deduct “up to $1,000 ($2,000 if filing jointly) of
              your cash contributions to certain qualified organizations.” You give roughly $13,000 a year, so you would
              capture the full $2,000 — worth about <b className={B}>$440</b> — if it were paid by transfer, cheque or
              card, or if the church issues a year-end statement for the cash.
            </p>
            <Sources>
              <Src href="https://www.irs.gov/charities-non-profits/substantiating-charitable-contributions">
                IRS: substantiating contributions
              </Src>{" "}
              · <Src href="https://www.irs.gov/taxtopics/tc506">Topic 506</Src> ·{" "}
              <Src href="https://www.law.cornell.edu/uscode/text/26/170">26 U.S.C. §170(f)(17)</Src> ·{" "}
              <Src href="https://www.irs.gov/publications/p526">Publication 526</Src>
            </Sources>
            <p className="text-xs">
              Worth saying plainly: this is a question about record-keeping, not about whether to give or how much. The
              giving is the giving. The $440 is only about whether there’s a piece of paper for it.
            </p>
          </Fact>

          <Fact q="Filing separately does have real benefits. Here they are, fairly stated.">
            <p>
              A separate return carries no joint and several liability, so April never becomes answerable for anything
              on his return — not an error, not an audit adjustment, not a future balance. Her refund is hers, with no
              form to file and no eight-week wait. She never has to rely on Form 8379 working, or on an IRS allocation
              calculated under Texas community property rules that might give her less than she expects. And if either
              of them has large medical expenses against a small income, the 7.5%-of-income floor is easier to clear on
              a separate return.
            </p>
            <p>
              Those are genuine. The joint-or-separate comparison above prices them: the question is whether that protection is worth what it
              costs, given that Form 8379 delivers most of the same refund protection on a joint return for the price
              of one form.
            </p>
          </Fact>

          <Fact q="Innocent spouse relief is a different thing from injured spouse relief.">
            <p>
              Injured spouse (Form 8379) is about protecting a refund from the other person’s debt. Innocent spouse
              (Form 8857) is about being released from liability for errors on a joint return you didn’t know about.
              Same word, opposite situations.
            </p>
            <Sources>
              <Src href="https://www.law.cornell.edu/uscode/text/26/6015">26 U.S.C. §6015</Src> ·{" "}
              <Src href="https://www.irs.gov/individuals/innocent-spouse-relief">IRS: innocent spouse relief</Src>
            </Sources>
          </Fact>

          <Fact q="There is a Georgia part-year return for 2026, but only for him.">
            <p>
              He earned Georgia wages and paid about $2,922 of Georgia tax through 31 August, then moved to Texas. That
              means a Georgia part-year resident return on top of the federal one. April never lived in Georgia, so she
              has no Georgia filing obligation of her own — which is worth knowing before a preparer assumes otherwise
              on a joint return.
            </p>
          </Fact>

          <Fact q="H&R Block’s own position is that joint is almost always better.">
            <p>
              Their guidance says you are “almost always better off Married Filing Jointly as many tax benefits aren’t
              available if you file separate returns,” and lists what goes: the child and dependent care credit, the
              earned income credit, student loan interest, education credits, and a reduced child tax credit
              threshold. The exceptions they name are large medical bills against a low income, alternative minimum
              tax, and wanting to stay clear of a spouse’s tax liens or penalties — which is the one that applies here,
              and which Form 8379 addresses without the cost.
            </p>
            <Sources>
              <Src href="https://www.hrblock.com/tax-center/filing/personal-tax-planning/married-filing-jointly-vs-separately/">
                H&amp;R Block: jointly vs separately
              </Src>{" "}
              ·{" "}
              <Src href="https://www.hrblock.com/tax-center/filing/personal-tax-planning/how-to-choose-tax-filing-status/">
                H&amp;R Block: choosing a filing status
              </Src>
            </Sources>
          </Fact>
    </ul>
  );
}

function Src({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="underline underline-offset-2 hover:text-foreground" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

const SOURCES: Array<[string, string]> = [
  ["https://www.irs.gov/individuals/injured-spouse-relief", "Injured spouse relief"],
  ["https://www.irs.gov/instructions/i8379", "Instructions for Form 8379"],
  ["https://www.irs.gov/individuals/innocent-spouse-relief", "Innocent spouse relief"],
  ["https://www.irs.gov/publications/p555", "Publication 555, Community Property"],
  ["https://www.irs.gov/payments/payment-plans-installment-agreements", "Payment plans and installment agreements"],
  [
    "https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill",
    "2026 inflation adjustments",
  ],
  ["https://www.irs.gov/credits-deductions/individuals/child-tax-credit", "Child tax credit"],
  ["https://www.irs.gov/publications/p503", "Publication 503, child and dependent care"],
  ["https://www.irs.gov/credits-deductions/individuals/lifetime-learning-credit", "Lifetime Learning Credit"],
  [
    "https://www.taxpayeradvocate.irs.gov/news/tax-tips/the-tax-ramifications-of-tying-the-knot/2025/07/",
    "Taxpayer Advocate: tax ramifications of marriage",
  ],
];

export function TaxFootnote() {
  return (
    <footer className="border-t border-border pt-4 space-y-2 text-xs text-muted-foreground leading-relaxed max-w-prose">
      <p>
        <b className="text-foreground">On the tax figures.</b> 2026 amounts from the IRS inflation-adjustment release:
        standard deduction $32,200 filing jointly and $16,100 separately; brackets 10% to $24,800, 12% to $100,800, 22%
        to $211,400 filing jointly; child tax credit up to $2,200 a child with up to $1,700 refundable, full below
        $400,000 joint. Child and dependent care credit 35% of up to $3,000 for one child or $6,000 for two, sliding to
        a 20% floor between $150,000 and $206,000 of joint AGI. Dependent care FSA limit $7,500. Lifetime Learning
        Credit 20% of up to $10,000, phasing out between about $160,000 and $180,000 joint. Texas has no state income
        tax. None of this is advice from a tax professional, and the injured spouse, community property and
        partnership-basis questions in particular are worth an hour with one before filing.
      </p>
      <p>
        Sources:{" "}
        {SOURCES.map(([href, label], i) => (
          <span key={href}>
            {i > 0 && " · "}
            <Src href={href}>{label}</Src>
          </span>
        ))}
      </p>
    </footer>
  );
}

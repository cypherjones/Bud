/**
 * Household plan math — pure functions, safe to import from client
 * components. Ported from "April and AJ's Financial Plan v1" (25 Oct 2026).
 * Everything here is in DOLLARS except HouseholdLine.amount, which is cents
 * like every other ledger column in Bud.
 */

export type LineOwner = "his" | "hers" | "both";

export type HouseholdLine = {
  id: string;
  slug: string | null;
  groupName: string;
  label: string;
  note: string | null;
  amount: number; // cents
  owner: LineOwner;
  categoryId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type Income = {
  hisNet: number;
  herNet: number;
  draw: number;
  boys: number;
  tithePct: number;
  savings: number; // put aside each month, before anything is left over
};

const clamp0 = (n: number) => Math.max(0, Number.isFinite(n) ? n : 0);

export function totalIncome(i: Income): number {
  return i.hisNet + i.herNet + i.draw + i.boys;
}

export function titheOn(income: number, tithePct: number): number {
  return Math.round((tithePct / 100) * income);
}

/** Dollar amount a line carries this month. The tithe line follows income. */
export function lineAmount(line: HouseholdLine, income: Income): number {
  return line.slug === "tithe" ? titheOn(totalIncome(income), income.tithePct) : line.amount / 100;
}

export function budgetTotals(lines: HouseholdLine[], income: Income) {
  const sums: Record<LineOwner, number> = { his: 0, hers: 0, both: 0 };
  for (const l of lines) sums[l.owner] += lineAmount(l, income);
  const moneyIn = totalIncome(income);
  const out = sums.his + sums.hers + sums.both;
  const hisIn = income.hisNet + income.draw;
  return {
    moneyIn,
    his: sums.his,
    hers: sums.hers,
    both: sums.both,
    out,
    savings: clamp0(income.savings),
    net: moneyIn - out - clamp0(income.savings),
    tithe: titheOn(moneyIn, income.tithePct),
    hisShareOfHisIncome: hisIn > 0 ? sums.his / hisIn : null,
    hersShareOfHerIncome: income.herNet > 0 ? sums.hers / income.herNet : null,
  };
}

/**
 * Three futures: same bills, three income pictures. Column 1 is his pay,
 * the draw and the boys; column 2 adds April; column 3 keeps April and drops
 * the draw. The tithe follows income in each column.
 */
export function futures(lines: HouseholdLine[], income: Income, aprilTakeHome: number) {
  const t = budgetTotals(lines, income);
  const april = clamp0(aprilTakeHome);
  const cols = [
    income.hisNet + income.draw + income.boys,
    income.hisNet + april + income.draw + income.boys,
    income.hisNet + april + income.boys,
  ];
  return cols.map((moneyIn) => {
    const out = t.out - t.tithe + titheOn(moneyIn, income.tithePct);
    return { moneyIn, out, left: moneyIn - out };
  });
}

export type CardPayoff =
  | { kind: "none" }
  | { kind: "never" }
  | { kind: "ok"; months: number; interest: number; paidOffBy: Date };

/** Month-by-month payoff of a revolving balance at a fixed payment. */
export function cardPayoff(balance: number, aprPct: number, payment: number, start: Date): CardPayoff {
  const bal = clamp0(balance);
  const rate = clamp0(aprPct) / 100 / 12;
  if (payment <= 0 || bal <= 0) return { kind: "none" };
  if (payment <= bal * rate) return { kind: "never" };
  let b = bal;
  let m = 0;
  let paid = 0;
  while (b > 0 && m < 600) {
    const interest = b * rate;
    b = b + interest - payment;
    paid += interest;
    m++;
  }
  const paidOffBy = new Date(start.getFullYear(), start.getMonth() + m - 1, 1);
  return { kind: "ok", months: m, interest: paid, paidOffBy };
}

/**
 * The bonus: what's left after supplemental withholding, FICA and tithe, what
 * it's been allocated to, and how many months of the post-Meridian gap the
 * remainder covers. Buying out the ring costs cash now and removes its line
 * from the gap.
 */
export function bonusAllocation(
  lines: HouseholdLine[],
  income: Income,
  aprilTakeHome: number,
  b: { gross: number; tithePct: number; ringBuyout: boolean; ringBuyoutCost: number; other: number },
) {
  const gross = clamp0(b.gross);
  const fed = gross * 0.22;
  const fica = gross * 0.0765;
  const net = gross - fed - fica;
  const tithe = gross * (clamp0(b.tithePct) / 100);
  const free = net - tithe;
  const allocated = (b.ringBuyout ? b.ringBuyoutCost : 0) + clamp0(b.other);
  const left = free - allocated;
  const ring = lines.find((l) => l.slug === "ring");
  const noMeridian = futures(lines, income, aprilTakeHome)[2];
  const gap = Math.max(0, noMeridian.out - noMeridian.moneyIn - (b.ringBuyout && ring ? ring.amount / 100 : 0));
  const months = gap > 0 ? left / gap : null;
  return { gross, fed, fica, net, tithe, free, left, gap, months };
}

// ============================================================
// 2026 FEDERAL TAX
// ============================================================

// 2026 figures from the IRS inflation-adjustment release (post-OBBBA)
type Brackets = Array<[upTo: number, rate: number]>;
const MFJ: Brackets = [[24800, 0.1], [100800, 0.12], [211400, 0.22], [403550, 0.24], [1e9, 0.32]];
const MFS: Brackets = [[12400, 0.1], [50400, 0.12], [105700, 0.22], [201775, 0.24], [1e9, 0.32]];
const STD_MFJ = 32200;
const STD_MFS = 16100;
const CTC_PER_CHILD = 2200;
const SUPPLEMENTAL_RATE = 0.22;
// Cash gifts deductible without itemising, from 2026: $2,000 joint, $1,000 each separately
const GIVING_CAP_MFJ = 2000;
const GIVING_CAP_MFS = 1000;
const DAYCARE_PER_YEAR = 7488;

function bracketTax(income: number, brackets: Brackets, std: number, ctc: number): number {
  const taxable = Math.max(0, income - std);
  let tax = 0;
  let prev = 0;
  for (const [upTo, rate] of brackets) {
    if (taxable <= prev) break;
    tax += (Math.min(taxable, upTo) - prev) * rate;
    prev = upTo;
  }
  return Math.max(0, tax - ctc);
}

const seTax = (netEarnings: number) => Math.round(clamp0(netEarnings) * 0.9235 * 0.153);

export type TaxInputs = {
  herProfit: number;
  guaranteedPayments: number;
  upe: number;
  kids: number;
  k1Loss: number;
  giving: number;
  tuition: number;
  wagesGross: number;
  section125: number;
  k401PerCheck: number;
  withholdingPerCheck: number;
  checksPerYear: number;
  upeIfAmended: number;
  k1ShareIfUsable: number;
};

export type ReturnRow = { label: string; amount: number; note: string; head?: boolean };

export function taxPlan2026(t: TaxInputs, bonusGross: number, irsBalance: number) {
  const her = clamp0(t.herProfit);
  const gp = clamp0(t.guaranteedPayments);
  const upe = Math.min(clamp0(t.upe), gp);
  const kids = clamp0(Math.round(t.kids));
  const ctc = kids * CTC_PER_CHILD;
  const k1 = clamp0(t.k1Loss);
  const giveJoint = Math.min(GIVING_CAP_MFJ, clamp0(t.giving));
  const giveSep = Math.min(GIVING_CAP_MFS, clamp0(t.giving));
  const tuition = clamp0(t.tuition);

  // His wages after Section 125 and the 401(k); withholding includes 22% on the bonus
  const hisWages = t.wagesGross - t.section125 - t.k401PerCheck * t.checksPerYear;
  const withheldFor = (perCheck: number) => Math.round(perCheck * t.checksPerYear + bonusGross * SUPPLEMENTAL_RATE);
  const withheld = withheldFor(t.withholdingPerCheck);

  const hisSE = seTax(gp - upe);
  const herSE = her > 0 ? seTax(her) : 0;
  const se = hisSE + herSE;
  const hisTaxable = hisWages + gp - upe - hisSE / 2 - k1;

  const joint = bracketTax(hisTaxable + her - herSE / 2 - giveJoint, MFJ, STD_MFJ, ctc);
  const sepHis = bracketTax(hisTaxable - giveSep, MFS, STD_MFS, ctc);
  const sepHer = bracketTax(her - herSE / 2, MFS, STD_MFS, 0);

  // Line-by-line joint return
  const agi = hisTaxable + her - herSE / 2;
  const cdccRate = Math.max(0.2, Math.min(0.35, 0.35 - (0.15 * Math.max(0, agi - 150000)) / 56000));
  const cdcc = her > 0 ? Math.round(Math.min(3000, DAYCARE_PER_YEAR) * cdccRate) : 0;
  const llcFull = Math.min(tuition, 10000) * 0.2;
  const llc = Math.round(agi <= 160000 ? llcFull : agi >= 180000 ? 0 : (llcFull * (180000 - agi)) / 20000);
  const taxable = Math.max(0, agi - STD_MFJ - giveJoint);
  const preCredit = bracketTax(taxable, MFJ, 0, 0);
  const totalJoint = Math.max(0, joint - cdcc - llc) + se;
  const refund = withheld - totalJoint;

  const returnRows: ReturnRow[] = [
    { label: "Navusoft wages, after health premiums and the 401(k)", amount: hisWages, note: "" },
    { label: "Meridian guaranteed payments", amount: gp, note: "Taxable to him whether or not the business earns anything" },
    {
      label: "Partnership costs he pays personally (UPE)",
      amount: -upe,
      note: upe > 0 ? "Schedule E line 28 — only if the agreement requires it" : "Zero until the operating agreement is amended",
    },
    {
      label: "His share of the partnership loss (K-1)",
      amount: -k1,
      note: k1 > 0 ? "Subject to basis and at-risk limits" : "Not claimed. His 35% share is about $43,578, and basis is the problem — see /plan.",
    },
    { label: "April's business, net", amount: her, note: her > 0 ? "" : "Nothing entered" },
    { label: "Deductible half of self-employment tax", amount: -Math.round(hisSE / 2 + herSE / 2), note: "" },
    { label: "Adjusted gross income", amount: Math.round(agi), note: "", head: true },
    { label: "Standard deduction, filing jointly", amount: -STD_MFJ, note: "" },
    {
      label: "Cash giving, without itemising",
      amount: -giveJoint,
      note: giveJoint > 0 ? "Capped at $2,000 for 2026" : "Needs a bank record or a church statement",
    },
    { label: "Taxable income", amount: Math.round(taxable), note: "", head: true },
    { label: "Income tax", amount: Math.round(preCredit), note: "" },
    { label: "Child tax credit", amount: -ctc, note: `${kids} ${kids === 1 ? "child" : "children"} at $2,200` },
    {
      label: "Child and dependent care credit",
      amount: -cdcc,
      note: cdcc > 0 ? `Elijah's daycare, at ${Math.round(cdccRate * 100)}% on $3,000` : "April needs earned income for this",
    },
    {
      label: "Lifetime Learning Credit",
      amount: -llc,
      note: tuition > 0 ? `20% of $${Math.min(tuition, 10000).toLocaleString("en-US")}, phased for AGI` : "Enter Harvard Extension tuition above",
    },
    { label: "Self-employment tax", amount: Math.round(se), note: "On the guaranteed payments and her business" },
    { label: "Total 2026 federal tax", amount: Math.round(totalJoint), note: "", head: true },
    {
      label: "Withheld from his pay",
      amount: withheld,
      note: `$${t.withholdingPerCheck.toLocaleString("en-US")} a check, plus 22% on the bonus`,
    },
    { label: "Refund", amount: Math.round(refund), note: "", head: true },
    { label: "Applied to the old IRS balance", amount: -irsBalance, note: "Refunds go here first while the payment plan runs" },
    { label: "Cash reaching the house", amount: Math.round(refund - irsBalance), note: "", head: true },
  ];

  // Joint vs separate. The separate column ignores the Texas community
  // property split (Form 8958) — it's the cost floor, not a full MFS return.
  const comparison = {
    jointIncomeTax: joint,
    sepHisIncomeTax: sepHis,
    sepHerIncomeTax: sepHer,
    sepIncomeTax: sepHis + sepHer,
    hisSE,
    herSE,
    jointOwed: joint + se,
    sepOwed: sepHis + sepHer + se,
    ctc,
    cdccAvailable: her > 0 ? Math.round(3000 * cdccRate) : 0,
    costOfSeparate: sepHis + sepHer - joint,
    withheld,
    refundJoint: withheld - (joint + se),
    refundSepHis: withheld - (sepHis + hisSE),
    cashJoint: withheld - (joint + se) - irsBalance,
    cashSep: withheld - (sepHis + hisSE) - irsBalance,
  };

  // W-4 scenarios, from the same inputs
  const owedWith = (u: number, loss: number) => {
    const se2 = seTax(gp - u);
    const ti = hisWages + gp - u - se2 / 2 - loss + her - herSE / 2;
    return bracketTax(ti - giveJoint, MFJ, STD_MFJ, ctc) + se2 + herSE;
  };
  const scenarios = [
    { label: "As it stands today", upe, loss: k1, owed: owedWith(upe, k1) },
    { label: "If the agreement is amended", upe: t.upeIfAmended, loss: k1, owed: owedWith(t.upeIfAmended, k1) },
    {
      label: "If the loss also becomes usable",
      upe: t.upeIfAmended,
      loss: t.k1ShareIfUsable,
      owed: owedWith(t.upeIfAmended, t.k1ShareIfUsable),
    },
  ];
  const w4Options = [
    { perCheck: t.withholdingPerCheck, label: "Leave it as it is" },
    { perCheck: 700, label: "Reduce to $700" },
    { perCheck: 250, label: "Reduce to $250" },
  ].map((o) => {
    const wh = withheldFor(o.perCheck);
    const outcomes = scenarios.map((s) => wh - s.owed);
    return {
      ...o,
      withheld: wh,
      outcomes,
      freedPerMonth: Math.round((t.withholdingPerCheck - o.perCheck) * (t.checksPerYear / 12)),
      risky: outcomes.some((d) => d < 0),
    };
  });

  return { agi, returnRows, comparison, scenarios, w4Options, withheld, irsBalance };
}

/**
 * The plan against this month's transactions. Only lines that are the sole
 * line on a category can be compared (the same rule the budget editor uses
 * for its "Spent" column); everything else is planned but untracked.
 * `spendByCategory` is cents per category, as getMonthSpendByCategory returns.
 */
export function planVsActual(lines: HouseholdLine[], income: Income, spendByCategory: Record<string, number>) {
  const perCategory = new Map<string, number>();
  for (const l of lines) if (l.categoryId) perCategory.set(l.categoryId, (perCategory.get(l.categoryId) ?? 0) + 1);

  const tracked: Array<{ id: string; label: string; planned: number; spent: number; over: number }> = [];
  for (const l of lines) {
    if (!l.categoryId || perCategory.get(l.categoryId) !== 1) continue;
    const planned = lineAmount(l, income);
    const spent = (spendByCategory[l.categoryId] ?? 0) / 100;
    tracked.push({ id: l.id, label: l.label, planned, spent, over: Math.max(0, spent - planned) });
  }
  const plannedTracked = tracked.reduce((s, t) => s + t.planned, 0);
  const spentTracked = tracked.reduce((s, t) => s + t.spent, 0);
  const overLines = tracked.filter((t) => t.over > 0).sort((a, b) => b.over - a.over);
  return {
    tracked,
    trackedCount: tracked.length,
    lineCount: lines.length,
    plannedTracked,
    spentTracked,
    overLines,
    overTotal: overLines.reduce((s, t) => s + t.over, 0),
  };
}

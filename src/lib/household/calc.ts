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

/**
 * What the budget's tithe line is figured on. April's tithe comes off the top
 * of her takings on the salon page, first fruits, before her pay exists, so
 * her pay is not tithed a second time here.
 */
export function titheBase(i: Income): number {
  return i.hisNet + i.draw + i.boys;
}

/** Dollar amount a line carries this month. The tithe line follows income. */
export function lineAmount(line: HouseholdLine, income: Income): number {
  return line.slug === "tithe" ? titheOn(titheBase(income), income.tithePct) : line.amount / 100;
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
    tithe: titheOn(titheBase(income), income.tithePct),
    hisShareOfHisIncome: hisIn > 0 ? sums.his / hisIn : null,
    hersShareOfHerIncome: income.herNet > 0 ? sums.hers / income.herNet : null,
  };
}

/**
 * Three futures: same bills, three income pictures. Column 1 is his pay,
 * the draw and the boys; column 2 adds April; column 3 keeps April and drops
 * the draw. The tithe follows income in each column; April's own tithe has
 * already come off her takings, so her take-home isn't in what it's figured on.
 */
export function futures(lines: HouseholdLine[], income: Income, aprilTakeHome: number) {
  const t = budgetTotals(lines, income);
  const april = clamp0(aprilTakeHome);
  const cols = [
    { titheOnThis: income.hisNet + income.draw + income.boys, april: 0 },
    { titheOnThis: income.hisNet + income.draw + income.boys, april },
    { titheOnThis: income.hisNet + income.boys, april },
  ];
  return cols.map((c) => {
    const moneyIn = c.titheOnThis + c.april;
    const out = t.out - t.tithe + titheOn(c.titheOnThis, income.tithePct);
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
  /** Federal tax withheld so far this year, from the last stub. 0 = estimate it from the per-check figure. */
  withheldYtd: number;
  checksPerYear: number;
  upeIfAmended: number;
  k1ShareIfUsable: number;
};

export type ReturnRow = { label: string; amount: number; note: string; head?: boolean };

/** Where the year's paychecks stand: how many have been paid and which are still to come. */
export type PayPosition = { checksPaid: number; checksLeft: number; upcoming: string[] };

const localDate = (y: number, m: number, d: number) => new Date(y, m, d).toLocaleDateString("en-CA");

/**
 * Semi-monthly paydays for a year — the 15th and the last day — moved back to
 * the Friday before when they fall on a weekend, as the Navusoft deposits do.
 */
export function semiMonthlyPaydays(year: number): string[] {
  const out: string[] = [];
  for (let m = 0; m < 12; m++) {
    for (const day of [15, new Date(year, m + 1, 0).getDate()]) {
      const d = new Date(year, m, day);
      const back = d.getDay() === 6 ? 1 : d.getDay() === 0 ? 2 : 0;
      out.push(localDate(year, m, day - back));
    }
  }
  return out;
}

/**
 * How many checks are paid as of `today` (YYYY-MM-DD, local). Semi-monthly
 * pay uses the real calendar; any other count is prorated through the year.
 */
export function payPosition(today: string, checksPerYear: number): PayPosition {
  const year = Number(today.slice(0, 4));
  const n = Math.max(0, Math.round(checksPerYear));
  if (n === 24) {
    const all = semiMonthlyPaydays(year);
    const upcoming = all.filter((d) => d > today);
    return { checksPaid: all.length - upcoming.length, checksLeft: upcoming.length, upcoming };
  }
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year + 1, 0, 1).getTime();
  const frac = (new Date(today + "T00:00:00").getTime() - start) / (end - start);
  const paid = Math.min(n, Math.max(0, Math.floor(n * frac)));
  return { checksPaid: paid, checksLeft: n - paid, upcoming: [] };
}

const usd0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * The 2026 federal picture from the planner inputs. `pay` says how many
 * checks are already paid: withholding to date is fixed, so a W-4 change only
 * moves the checks that are left.
 */
export function taxPlan2026(t: TaxInputs, bonusGross: number, irsBalance: number, pay?: PayPosition) {
  const her = clamp0(t.herProfit);
  const gp = clamp0(t.guaranteedPayments);
  const upe = Math.min(clamp0(t.upe), gp);
  const kids = clamp0(Math.round(t.kids));
  const ctc = kids * CTC_PER_CHILD;
  const k1 = clamp0(t.k1Loss);
  const giveJoint = Math.min(GIVING_CAP_MFJ, clamp0(t.giving));
  const giveSep = Math.min(GIVING_CAP_MFS, clamp0(t.giving));
  const tuition = clamp0(t.tuition);
  const irs = clamp0(irsBalance);
  const checks = clamp0(Math.round(t.checksPerYear));
  const p: PayPosition = pay ?? { checksPaid: checks, checksLeft: 0, upcoming: [] };

  // His wages after Section 125 and the 401(k)
  const hisWages = t.wagesGross - t.section125 - t.k401PerCheck * t.checksPerYear;
  const herSE = her > 0 ? seTax(her) : 0;
  const herEarned = Math.max(0, her - herSE / 2);

  /** The whole joint return for a given UPE and usable K-1 loss: one function, so every column agrees. */
  const jointReturn = (u: number, loss: number) => {
    const uu = Math.min(clamp0(u), gp);
    const hisSE = seTax(gp - uu);
    const hisTaxable = hisWages + gp - uu - hisSE / 2 - clamp0(loss);
    const agi = hisTaxable + her - herSE / 2;
    const taxable = Math.max(0, agi - STD_MFJ - giveJoint);
    const preCredit = bracketTax(taxable, MFJ, 0, 0);
    const afterCtc = Math.max(0, preCredit - ctc);
    // Childcare credit: one qualifying child (Elijah), and the expenses can't
    // exceed the lower earner's earned income — with April at $0 the credit is $0.
    const cdccRate = Math.max(0.2, Math.min(0.35, 0.35 - (0.15 * Math.max(0, agi - 150000)) / 56000));
    const hisEarned = Math.max(0, hisWages + gp - uu - hisSE / 2);
    const cdccBase = Math.min(3000, DAYCARE_PER_YEAR, herEarned, hisEarned);
    const cdcc = Math.round(cdccBase * cdccRate);
    const llcFull = Math.min(tuition, 10000) * 0.2;
    const llc = Math.round(agi <= 160000 ? llcFull : agi >= 180000 ? 0 : (llcFull * (180000 - agi)) / 20000);
    const se = hisSE + herSE;
    const total = Math.max(0, afterCtc - cdcc - llc) + se;
    return { hisSE, hisTaxable, agi, taxable, preCredit, afterCtc, cdccRate, cdccBase, cdcc, llc, se, total };
  };

  const r = jointReturn(upe, k1);
  const { agi, taxable, preCredit, cdcc, cdccRate, llc, se, hisSE } = r;

  // Withholding: what is already withheld is fixed; only the checks left can change.
  const ytdEstimated = !(t.withheldYtd > 0);
  const withheldYtd = ytdEstimated
    ? Math.round(t.withholdingPerCheck * p.checksPaid + bonusGross * SUPPLEMENTAL_RATE)
    : Math.round(t.withheldYtd);
  const withheldFor = (perCheck: number) => Math.round(withheldYtd + clamp0(perCheck) * p.checksLeft);
  const withheld = withheldFor(t.withholdingPerCheck);
  const refund = withheld - r.total;

  // A joint refund is applied to his old balance first (26 U.S.C. §6402).
  const offsetOf = (refundAmt: number) => Math.min(irs, Math.max(0, refundAmt));
  const offset = offsetOf(refund);

  const returnRows: ReturnRow[] = [
    {
      label: "Navusoft wages, after health premiums and the 401(k)",
      amount: hisWages,
      note: "From the stubs. Check it against the last stub's year-to-date gross, which should include the September bonus.",
    },
    {
      label: "Meridian guaranteed payments",
      amount: gp,
      note: "Taxable to him whether or not the business earned anything. Meridian's final K-1 will state the total.",
    },
    {
      label: "Partnership costs he paid personally (UPE)",
      amount: -upe,
      note: upe > 0 ? "Schedule E line 28. Only if the operating agreement required him to bear them." : "Zero unless the operating agreement requires him to bear them.",
    },
    {
      label: "His share of the partnership loss (K-1)",
      amount: -k1,
      note: k1 > 0 ? "Subject to basis and at-risk limits." : "Not claimed. Basis is the open question; see Meridian on the plan.",
    },
    { label: "April's business, net", amount: her, note: her > 0 ? "" : "Entered as $0." },
    { label: "Deductible half of self-employment tax", amount: -Math.round(hisSE / 2 + herSE / 2), note: "" },
    { label: "Adjusted gross income", amount: Math.round(agi), note: "", head: true },
    { label: "Standard deduction, filing jointly", amount: -STD_MFJ, note: "" },
    {
      label: "Cash giving, without itemising",
      amount: -giveJoint,
      note: giveJoint > 0 ? "Capped at $2,000 for 2026." : "Needs a bank record or a church statement.",
    },
    { label: "Taxable income", amount: Math.round(taxable), note: "", head: true },
    { label: "Income tax", amount: Math.round(preCredit), note: "" },
    { label: "Child tax credit", amount: -ctc, note: `${kids} ${kids === 1 ? "child" : "children"} at $2,200.` },
    {
      label: "Child and dependent care credit",
      amount: -cdcc,
      note:
        cdcc > 0
          ? `Elijah's daycare: ${Math.round(cdccRate * 100)}% of ${usd0(r.cdccBase)}${r.cdccBase < 3000 ? ", capped at April's earned income" : ""}.`
          : "$0 while April's earned income is $0. Expenses are capped at the lower earner's earned income.",
    },
    {
      label: "Lifetime Learning Credit",
      amount: -llc,
      note: tuition > 0 ? `20% of ${usd0(Math.min(tuition, 10000))}${agi > 160000 ? ", reduced because AGI is over $160,000" : ""}.` : "Enter Harvard Extension tuition above.",
    },
    { label: "Self-employment tax", amount: Math.round(se), note: "On the guaranteed payments and her business." },
    { label: "Total 2026 federal tax", amount: Math.round(r.total), note: "", head: true },
    {
      label: "Withheld from his pay",
      amount: withheld,
      note:
        `${usd0(withheldYtd)} so far${ytdEstimated ? ` (estimated: ${p.checksPaid} checks at $${t.withholdingPerCheck.toLocaleString("en-US")} plus 22% on the bonus)` : " (from the last stub)"}` +
        (p.checksLeft > 0 ? `, plus ${p.checksLeft} more ${p.checksLeft === 1 ? "check" : "checks"} at $${t.withholdingPerCheck.toLocaleString("en-US")}.` : "."),
    },
    { label: refund >= 0 ? "Refund" : "Owed at filing", amount: Math.round(refund), note: "", head: true },
    {
      label: "Taken for the old IRS balance",
      amount: -Math.round(offset),
      note: refund > 0 ? "A joint refund is applied to his installment balance before anything is paid out." : "No refund to take.",
    },
    { label: "Cash reaching the house", amount: Math.round(Math.max(0, refund) - offset), note: "", head: true },
  ];

  // Joint vs separate. The separate column ignores the Texas community
  // property split (Form 8958) — it's the cost floor, not a full MFS return.
  // Neither the childcare nor the education credit is allowed filing separately.
  const sepHis = bracketTax(r.hisTaxable - giveSep, MFS, STD_MFS, ctc);
  const sepHer = bracketTax(her - herSE / 2, MFS, STD_MFS, 0);
  const jointIncomeTax = Math.max(0, r.afterCtc - cdcc - llc);
  const refundSepHis = withheld - (sepHis + hisSE);
  const comparison = {
    jointIncomeTax,
    sepHisIncomeTax: sepHis,
    sepHerIncomeTax: sepHer,
    sepIncomeTax: sepHis + sepHer,
    hisSE,
    herSE,
    jointOwed: r.total,
    sepOwed: sepHis + sepHer + se,
    ctc,
    cdcc,
    llc,
    costOfSeparate: sepHis + sepHer + se - r.total,
    withheld,
    refundJoint: refund,
    refundSepHis,
    cashJoint: Math.max(0, refund) - offset,
    cashSep: Math.max(0, refundSepHis) - offsetOf(refundSepHis),
    leftOnBalanceJoint: irs - offset,
    leftOnBalanceSep: irs - offsetOf(refundSepHis),
  };

  // The same return under the open Meridian questions.
  const scenarios = [
    { label: "As it stands today", upe, loss: k1, owed: r.total },
    { label: "If the agreement covers his costs", upe: t.upeIfAmended, loss: k1, owed: jointReturn(t.upeIfAmended, k1).total },
    {
      label: "If the loss is also usable",
      upe: t.upeIfAmended,
      loss: t.k1ShareIfUsable,
      owed: jointReturn(t.upeIfAmended, t.k1ShareIfUsable).total,
    },
  ];

  // W-4 options for the checks that are left. Withholding is semi-monthly, so
  // a lower figure frees two checks' worth a month — only until December 31.
  const perCheckFor = (target: number) =>
    p.checksLeft > 0 ? Math.max(0, Math.ceil((target - withheldYtd) / p.checksLeft / 10) * 10) : t.withholdingPerCheck;
  const candidates: Array<{ perCheck: number; kind: "now" | "cushion" | "exact" | "half" }> = [
    { perCheck: t.withholdingPerCheck, kind: "now" },
    { perCheck: perCheckFor(r.total + 1000), kind: "cushion" },
    { perCheck: perCheckFor(r.total), kind: "exact" },
    { perCheck: Math.round(t.withholdingPerCheck / 2 / 10) * 10, kind: "half" },
  ];
  const seen = new Set<number>();
  const checksPerMonth = checks === 24 ? 2 : checks / 12;
  const w4Options = candidates
    .filter((o) => (seen.has(o.perCheck) ? false : (seen.add(o.perCheck), true)))
    .slice(0, 3)
    .sort((a, b) => b.perCheck - a.perCheck)
    .map((o) => {
      const wh = withheldFor(o.perCheck);
      const outcomes = scenarios.map((s) => wh - s.owed);
      const freedPerCheck = t.withholdingPerCheck - o.perCheck;
      const left = outcomes[0];
      const leaves = left >= 0 ? `Leaves a ${usd0(left)} refund on today's estimate.` : `Leaves ${usd0(-left)} owed on today's estimate.`;
      const why =
        o.kind === "now"
          ? "What payroll withholds now."
          : o.perCheck === 0
            ? `What's already withheld covers today's estimate, so this stops federal withholding until January. ${leaves}`
            : o.kind === "cushion"
              ? "Covers today's estimate with $1,000 to spare, in case the inputs turn out higher."
              : o.kind === "exact"
                ? "Covers today's estimate exactly. Any surprise is owed at filing."
                : `Half of what payroll withholds now. ${leaves}`;
      return {
        perCheck: o.perCheck,
        why,
        label:
          o.kind === "now"
            ? "Leave it as it is"
            : o.perCheck === 0
              ? "Withhold nothing more this year"
              : `${o.perCheck > t.withholdingPerCheck ? "Raise" : "Lower"} to $${o.perCheck.toLocaleString("en-US")} a check`,
        withheld: wh,
        outcomes,
        freedPerCheck,
        freedPerMonth: Math.round(freedPerCheck * checksPerMonth),
        freedTotal: Math.round(freedPerCheck * p.checksLeft),
        risky: outcomes.some((d) => d < 0),
      };
    });

  return {
    agi,
    returnRows,
    comparison,
    scenarios,
    w4Options,
    withheld,
    withheldYtd,
    ytdEstimated,
    pay: p,
    total: r.total,
    refund,
    offset,
    irsBalance: irs,
    /** Positive when the return would end with a balance due. */
    dueAtFiling: Math.max(0, r.total - withheld),
    cdcc,
    cdccRate,
    llc,
    herEarned,
  };
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

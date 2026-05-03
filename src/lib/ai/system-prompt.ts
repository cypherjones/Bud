import { db, schema } from "@/lib/db";
import { desc, eq, sql, and, gte } from "drizzle-orm";
import { formatCurrency } from "@/lib/utils/format";
import {
  getTotalBalance,
  getMetrics,
  getDebtSummary,
  getDebtFreeProjection,
  getUpcomingBillCluster,
  getSavingsTarget,
} from "@/lib/actions/dashboard";
import { getUpcomingDebtDeadlines } from "@/lib/actions/debts";

export type FinancialContext = {
  totalBalance: string;
  monthlySpending: string;
  monthlyIncome: string;
  debtSummary: string;
  taxSummary: string;
  creditSummary: string;
  movePlanSummary: string;
  upcomingBills: string;
  budgetStatus: string;
  // M4.1 — live state snapshots so the AI doesn't have to call a dozen tools
  // just to start a conversation.
  liveStateSnapshot: string;
};

export async function buildFinancialContext(): Promise<FinancialContext> {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const today = now.toISOString().split("T")[0];

  // Monthly transactions
  const monthlyTransactions = db
    .select({
      type: schema.transactions.type,
      total: sql<number>`SUM(${schema.transactions.amount})`,
    })
    .from(schema.transactions)
    .where(gte(schema.transactions.date, monthStart))
    .groupBy(schema.transactions.type)
    .all();

  const spending = monthlyTransactions.find((t) => t.type === "expense")?.total ?? 0;
  const income = monthlyTransactions.find((t) => t.type === "income")?.total ?? 0;

  // Debts
  const activeDebts = db
    .select()
    .from(schema.debts)
    .where(eq(schema.debts.status, "active"))
    .all();

  const totalDebt = activeDebts.reduce((sum, d) => sum + d.currentBalance, 0);
  const totalMinPayments = activeDebts.reduce((sum, d) => sum + d.minimumPayment, 0);

  let debtSummary = "No debts tracked.";
  if (activeDebts.length > 0) {
    const debtLines = activeDebts.map(
      (d) =>
        `  - ${d.creditorName} (${d.type}): ${formatCurrency(d.currentBalance)} at ${(d.interestRate * 100).toFixed(1)}% APR, min ${formatCurrency(d.minimumPayment)}/mo${d.creditLimit ? `, utilization ${Math.round((d.currentBalance / d.creditLimit) * 100)}%` : ""}`
    );
    debtSummary = `Total debt: ${formatCurrency(totalDebt)} across ${activeDebts.length} accounts. Total minimums: ${formatCurrency(totalMinPayments)}/mo.\n${debtLines.join("\n")}`;
  }

  // Tax obligations
  const activeTaxes = db
    .select()
    .from(schema.taxObligations)
    .where(eq(schema.taxObligations.status, "active"))
    .all();

  let taxSummary = "No tax obligations tracked.";
  if (activeTaxes.length > 0) {
    const totalTaxOwed = activeTaxes.reduce((sum, t) => sum + t.remainingBalance, 0);
    const taxLines = activeTaxes.map(
      (t) =>
        `  - ${t.agency} ${t.type} (${t.taxYear}): ${formatCurrency(t.remainingBalance)} remaining${t.dueDate ? `, due ${t.dueDate}` : ""}${t.isInstallmentPlan ? `, installment ${formatCurrency(t.installmentAmount ?? 0)}/mo` : ""}${t.penaltyRate ? `, penalty rate ${(t.penaltyRate * 100).toFixed(1)}%` : ""}`
    );
    taxSummary = `Total taxes owed: ${formatCurrency(totalTaxOwed)}.\n${taxLines.join("\n")}`;
  }

  // Credit score
  const latestScore = db
    .select()
    .from(schema.creditScores)
    .orderBy(desc(schema.creditScores.date))
    .limit(1)
    .all();

  const previousScore = db
    .select()
    .from(schema.creditScores)
    .orderBy(desc(schema.creditScores.date))
    .limit(1)
    .offset(1)
    .all();

  let creditSummary = "No credit score logged.";
  if (latestScore.length > 0) {
    const s = latestScore[0];
    const tier =
      s.score >= 800 ? "Excellent" :
      s.score >= 740 ? "Very Good" :
      s.score >= 670 ? "Good" :
      s.score >= 580 ? "Fair" : "Poor";
    creditSummary = `Current score: ${s.score} (${tier})${s.source ? ` via ${s.source}` : ""}, as of ${s.date}.`;
    if (previousScore.length > 0) {
      const diff = s.score - previousScore[0].score;
      creditSummary += ` Change: ${diff >= 0 ? "+" : ""}${diff} points.`;
    }
  }

  // Houston move plan
  const movePlan = db
    .select()
    .from(schema.financialPlans)
    .where(eq(schema.financialPlans.type, "move"))
    .limit(1)
    .all();

  let movePlanSummary = "No move plan created yet.";
  if (movePlan.length > 0) {
    const plan = movePlan[0];
    const lineItems = db
      .select()
      .from(schema.planLineItems)
      .where(eq(schema.planLineItems.planId, plan.id))
      .all();
    const totalEstimated = lineItems.reduce((s, i) => s + (i.estimatedAmount ?? 0), 0);
    const paidItems = lineItems.filter((i) => i.isPaid).length;
    const daysUntil = plan.targetDate
      ? Math.ceil((new Date(plan.targetDate).getTime() - now.getTime()) / 86400000)
      : null;
    movePlanSummary = `"${plan.name}" — ${plan.status}. Target: ${plan.targetDate ?? "not set"}${daysUntil !== null ? ` (${daysUntil} days away)` : ""}. Saved: ${formatCurrency(plan.currentSaved)} of ${formatCurrency(plan.targetAmount ?? totalEstimated)} target. ${lineItems.length} line items (${paidItems} paid).`;
  }

  // Upcoming recurring bills
  const recurring = db
    .select()
    .from(schema.recurringTransactions)
    .where(eq(schema.recurringTransactions.isActive, true))
    .all();

  let upcomingBills = "No recurring bills detected.";
  if (recurring.length > 0) {
    const billLines = recurring.map(
      (r) => `  - ${r.merchant}: ${formatCurrency(r.amount)} ${r.frequency}${r.nextDueDate ? `, next due ${r.nextDueDate}` : ""}`
    );
    upcomingBills = `${recurring.length} recurring bills:\n${billLines.join("\n")}`;
  }

  // Budget status
  const budgets = db
    .select()
    .from(schema.budgets)
    .all();

  let budgetStatus = "No budgets set.";
  if (budgets.length > 0) {
    const budgetLines = await Promise.all(
      budgets.map(async (b) => {
        const cat = b.categoryId
          ? db.select().from(schema.categories).where(eq(schema.categories.id, b.categoryId)).get()
          : null;
        const spent = db
          .select({ total: sql<number>`SUM(${schema.transactions.amount})` })
          .from(schema.transactions)
          .where(
            and(
              eq(schema.transactions.categoryId, b.categoryId ?? ""),
              gte(schema.transactions.date, monthStart),
              eq(schema.transactions.type, "expense")
            )
          )
          .get();
        const spentAmount = spent?.total ?? 0;
        const pct = b.amount > 0 ? Math.round((spentAmount / b.amount) * 100) : 0;
        return `  - ${cat?.name ?? "Overall"}: ${formatCurrency(spentAmount)} / ${formatCurrency(b.amount)} (${pct}%)`;
      })
    );
    budgetStatus = `${budgets.length} active budgets:\n${budgetLines.join("\n")}`;
  }

  // === M4.1 live-state snapshot ===
  // One compact section the AI sees on every chat turn so it can answer
  // "where am I" without burning multiple tool calls just to load context.
  const balanceInfo = getTotalBalance();
  const metrics = getMetrics();
  const debtData = getDebtSummary();
  const debtFree = getDebtFreeProjection();
  const billCluster = getUpcomingBillCluster();
  const savingsTarget = getSavingsTarget();
  const debtDeadlines = getUpcomingDebtDeadlines();

  const snapshotParts: string[] = [];
  snapshotParts.push(`Total liquid balance: ${formatCurrency(balanceInfo.totalBalance)} across ${balanceInfo.accountCount} non-business accounts.`);
  snapshotParts.push(`This month so far: ${formatCurrency(metrics.income)} in / ${formatCurrency(metrics.spending)} out (net ${formatCurrency(metrics.income - metrics.spending)}).`);

  if (debtData.monthRecommended > 0) {
    const pct = Math.round((debtData.monthActual / debtData.monthRecommended) * 100);
    snapshotParts.push(`Debt this month: ${formatCurrency(debtData.monthActual)} paid of ${formatCurrency(debtData.monthRecommended)} recommended (${pct}%).`);
  }

  if (debtFree.atRecommended || debtFree.atMinimum) {
    const target = debtFree.atRecommended ?? debtFree.atMinimum;
    const months = debtFree.monthsAtRecommended ?? debtFree.monthsAtMinimum;
    snapshotParts.push(`Projected debt-free at current pace: ${target} (${months} months).`);
  }

  if (debtDeadlines.length > 0) {
    const deadlineLines = debtDeadlines.map((d) => {
      const dayLabel = d.daysAway < 0
        ? `${Math.abs(d.daysAway)}d past due`
        : d.daysAway === 0
          ? "today"
          : `in ${d.daysAway}d`;
      return `${d.creditorName}: ${formatCurrency(d.amount)} by ${d.deadline} (${dayLabel})${d.note ? ` — ${d.note}` : ""}`;
    }).join("; ");
    snapshotParts.push(`Active deadlines: ${deadlineLines}.`);
  }

  if (billCluster) {
    const net = billCluster.totalOutflow - billCluster.totalInflow;
    snapshotParts.push(`Upcoming bill cluster: ${formatCurrency(billCluster.totalOutflow)} hits ${billCluster.startDate}–${billCluster.endDate} (net −${formatCurrency(net)}, biggest: ${billCluster.biggestBillName}).`);
  }

  snapshotParts.push(`Savings target (next 30 days): ${formatCurrency(savingsTarget.target)} = ${formatCurrency(savingsTarget.forecastedIncome)} income − ${formatCurrency(savingsTarget.recurringBills)} bills − ${formatCurrency(savingsTarget.discretionaryBuffer)} discretionary.`);

  const liveStateSnapshot = snapshotParts.map((p) => `- ${p}`).join("\n");

  return {
    totalBalance: formatCurrency(balanceInfo.totalBalance),
    monthlySpending: formatCurrency(spending),
    monthlyIncome: formatCurrency(income),
    debtSummary,
    taxSummary,
    creditSummary,
    movePlanSummary,
    upcomingBills,
    budgetStatus,
    liveStateSnapshot,
  };
}

export function buildSystemPrompt(context: FinancialContext): string {
  const today = new Date().toISOString().split("T")[0];

  return `You are Bud, a direct financial strategist. You don't do fluff.

Your job: tell the user exactly what needs to happen to hit their goals, with specific numbers and dates. Every statement should be actionable or informative — never filler.

## Style & Formatting
- Lead with the number or the action. "You need $847 by July 15."
- **Always use markdown** — tables for comparisons, **bold** for key numbers, headers for sections
- Use tables whenever presenting multiple items with amounts: | Item | Monthly | Annual |
- Short paragraphs. Bullet points for lists. Bold the key numbers.
- Show your math when recommending actions. "$200 extra saves $47 in interest" not "paying more is better"
- Never judgmental about past decisions. Relentlessly forward-looking.
- When something is off track, say so immediately and pivot to the fix
- Connect every recommendation to a specific goal the user has
- When trade-offs exist, lay them out plainly: "Option A gets you X but costs Y"
- When the user is discouraged, acknowledge it briefly, then show concrete progress and next steps
- End substantive responses with a concrete next step or question
- Don't celebrate unless something actually moved the needle significantly

## User Profile
- Ashaun Jones, Operations at Navusoft Inc ($115k W-2) + owner's draw from Meridian Analytics ($45k/yr, switching to draw starting May 2026)
- Girlfriend: April (turning 23). She is taking the VW and its Geico insurance ($167/mo) but Ashaun still pays the VW car loan ($447/mo)
- Moving from Atlanta, GA → Houston, TX (already splitting time 50/50)
- Banks: Capital One (Simply Checking 2770, 360 Checking 1387, 360 Savings 9902), Chime (checking 4414), Navy Federal
- Pay schedule: semi-monthly (1st and 15th), net ~$3,143/paycheck + $3,750/mo Meridian draw
- Monthly income: ~$10,036 | Monthly spending: ~$9,305 | Gap: ~$731 (before cuts)
- Has two car loans through Bridgecrest: Primary ($801/mo) + VW ($447/mo) = $1,248/mo
- Auto insurance: Geico Primary ($412/mo) + Geico VW ($167/mo, transferring to April)
- Uses MyPay cash advance app — borrowing $160-280/paycheck then repaying + $5 fee. THIS IS A DEBT TRAP — flag it when relevant.
- April 2026 had many birthday dinners (April 23, Silas 27, Simon 25) — dining will be lower in May
- Meridian Analytics was previously W-2 via "A.S. Infinite Solutions" payroll, switched to owner's draw starting May 2026. Draw has NO tax withholding — needs quarterly estimated payments.
- $700/mo tax reserve on Meridian draw (~18.75%)

## Active Goals
1. **Get one month ahead** — build a $9,305 spending buffer
2. **Houston Move Fund** — save $8,000 cash for the move
3. **Engagement ring for April** — budget TBD
4. **Establish TX residency** — eliminate GA state income tax (~$5k/yr savings). Tabled for now.
5. **Cut frivolous spending and liabilities** — user's top priority

## Cuts Already Made (~$398/mo saved)
- Cancelled: AlpacaDB ($99), RUUTLABS ($43.50), Tiingo ($30), TradingView x2 ($29.90), OnlyFans ($16.24), Midjourney ($10.60)
- Reduced: NYTimes from $6 to $3.99
- Pending: Geico VW ($167) transferring to April

## Key Context
- Bridgecrest car payments are NOT negotiable right now — no payoff in sight
- Houston rent should be cheaper than current $2,500 ATL rent
- Round-ups on Chime are automatic micro-transfers to savings, not subscriptions
- Apple charges are bundled and need further audit (user should screenshot Apple ID > Subscriptions)
- Has ~$595/mo in dev/hosting tools — many may be Meridian Analytics business expenses (tax-deductible)

## What you know right now
Today is ${today}.

### Live state snapshot (refreshed every chat turn)
${context.liveStateSnapshot}

### Detailed sections

**Total balance:** ${context.totalBalance}
**Monthly spending:** ${context.monthlySpending}
**Monthly income:** ${context.monthlyIncome}

**Debts:**
${context.debtSummary}

**Taxes:**
${context.taxSummary}

**Credit:**
${context.creditSummary}

**Houston Move:**
${context.movePlanSummary}

**Recurring bills:**
${context.upcomingBills}

**Budgets:**
${context.budgetStatus}

## Houston, TX Cost Data (reference for move planning)
### Rent by Area (1BR / 2BR monthly)
- Downtown/Midtown: $1,400-$1,900 / $1,800-$2,600
- Montrose: $1,300-$1,800 / $1,700-$2,400
- The Heights: $1,400-$2,000 / $1,800-$2,700
- Rice Village/Museum District: $1,300-$1,800 / $1,700-$2,500
- Katy (suburban): $1,100-$1,500 / $1,400-$1,900
- Sugar Land: $1,200-$1,600 / $1,500-$2,100
- Spring/The Woodlands: $1,200-$1,700 / $1,500-$2,200

### Utilities (monthly)
- Electricity: $120-$200 (summer: $250-$350, A/C runs constantly June-Sept)
- Water/sewer: $30-$50
- Internet: $50-$80
- Renter's insurance: $15-$30/mo

### Texas-specific
- NO state income tax
- Property tax ~2.2% (relevant if buying)
- Car insurance higher than national average
- Car is required — Houston is very spread out
- Electricity is DEREGULATED — shop rates on powertochoose.org
- Check flood zone maps before signing a lease

### Moving costs
- Local (within TX): $800-$2,000
- Out of state (neighboring): $2,000-$4,000
- Cross country: $3,500-$7,000
- Pod/container: $2,000-$5,000

## Tax tracking disclaimer
You help track tax payments and plan cash flow around them. You are NOT a tax advisor. When first discussing taxes, include: "I can help track payments and plan cash flow, but for tax strategy or disputes, consult a CPA or enrolled agent."

## Credit coaching notes
- Utilization below 30% is a discrete score improvement threshold
- Utilization below 10% is even better
- Payment history is 35% of FICO score
- Hard inquiries fall off after 2 years
- Warn about score-damaging actions before the Houston move (need good score for apartment applications)
- Connect debt payments to utilization changes whenever relevant

## Tools
You have tools to read and modify financial data. Use them proactively to answer questions with real numbers. When the user asks about spending, debts, or goals — look it up, don't guess. When making changes (adding debts, logging payments, creating plans), confirm the details with the user first, then execute.

## Example interaction style
When the user asks "what should I cut?", don't say "consider reducing dining out." Instead:

**Your dining spend is $625 this month across 15 transactions.**

| Restaurant | Visits | Total |
|---|---:|---:|
| Uchi | 2 | $358 |
| Hopdoddy | 2 | $68 |
| Josephines | 1 | $97 |

Cutting dining to 4x/month ($200 budget) frees up **$425/mo** — that funds your move in 19 months or your ring in 12.

**Next step:** Want me to set a $200 dining budget?`;
}

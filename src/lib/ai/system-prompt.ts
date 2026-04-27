import { db, schema } from "@/lib/db";
import { desc, eq, sql, and, gte } from "drizzle-orm";
import { formatCurrency } from "@/lib/utils/format";

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

  return {
    totalBalance: "--", // Will come from Teller accounts
    monthlySpending: formatCurrency(spending),
    monthlyIncome: formatCurrency(income),
    debtSummary,
    taxSummary,
    creditSummary,
    movePlanSummary,
    upcomingBills,
    budgetStatus,
  };
}

export function buildSystemPrompt(context: FinancialContext): string {
  const today = new Date().toISOString().split("T")[0];

  return `You are Bud, a direct financial strategist. You don't do fluff.

Your job: tell the user exactly what needs to happen to hit their goals, with specific numbers and dates. Every statement should be actionable or informative — never filler.

## Style
- Lead with the number or the action. "You need $847 by July 15."
- Don't celebrate unless something actually moved the needle significantly
- When something is off track, say so immediately and pivot to the fix
- Connect every recommendation to a specific goal it serves
- When trade-offs exist, lay them out plainly: "Option A gets you X but costs Y"
- Short paragraphs. Bullet points for lists. Bold the key numbers.
- Show your math when recommending actions. "$200 extra saves $47 in interest" not "paying more is better"
- Never judgmental about past decisions. Relentlessly forward-looking.
- When the user is discouraged, acknowledge it briefly, then show concrete progress and next steps

## What you know right now
Today is ${today}.

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
You have tools to read and modify financial data. Use them proactively to answer questions with real numbers. When the user asks about spending, debts, or goals — look it up, don't guess. When making changes (adding debts, logging payments, creating plans), confirm the details with the user first, then execute.`;
}

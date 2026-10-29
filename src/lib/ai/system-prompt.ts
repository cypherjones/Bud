import { db, schema } from "@/lib/db";
import { desc, eq, sql, and, gte } from "drizzle-orm";
import { formatCurrency } from "@/lib/utils/format";
import {
  getTotalBalance,
  getMetrics,
  getDebtSummary,
  getDebtFreeProjection,
  getUpcomingBillCluster,
} from "@/lib/actions/dashboard";
import { getUpcomingDebtDeadlines } from "@/lib/actions/debts";
import { loadPlan } from "@/lib/household/load";
import { budgetTotals, lineAmount } from "@/lib/household/calc";
import { getBalances } from "@/lib/actions/balances";
import { getSubscriptionToDo } from "@/lib/subscriptions/view";

export type FinancialContext = {
  totalBalance: string;
  monthlySpending: string;
  monthlyIncome: string;
  debtSummary: string;
  taxSummary: string;
  creditSummary: string;
  planSummary: string;
  accountsSummary: string;
  subscriptionsSummary: string;
  upcomingBills: string;
  budgetStatus: string;
  // M4.1 — live state snapshots so the AI doesn't have to call a dozen tools
  // just to start a conversation.
  liveStateSnapshot: string;
};

export async function buildFinancialContext(): Promise<FinancialContext> {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

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

  const { config, lines } = loadPlan();
  const irsLine = lines.find((l) => /irs/i.test(l.label));
  let taxSummary = irsLine
    ? `IRS installment agreement: about ${formatCurrency(config.tax.irsBalanceFallback * 100)} owed (pre-marriage balance), paying ${formatCurrency(irsLine.amount)}/mo per the plan. No other obligations tracked; 2026 return is a GA part-year + TX year, and Meridian's closing still has tax tasks.`
    : "No tax obligations tracked.";
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
    const monthsOld = Math.floor((now.getTime() - new Date(s.date + "T00:00:00").getTime()) / (30.4 * 86400000));
    creditSummary = `Last logged score: ${s.score} (${tier})${s.source ? ` via ${s.source}` : ""}, as of ${s.date}${monthsOld >= 2 ? ` — ${monthsOld} months old; ask for a current one before reasoning about the score` : ""}. The /credit page compares the April report with live balances.`;
    if (previousScore.length > 0) {
      const diff = s.score - previousScore[0].score;
      creditSummary += ` Change: ${diff >= 0 ? "+" : ""}${diff} points.`;
    }
  }

  // The household plan is the budget.
  const totals = budgetTotals(lines, config.income);
  const usd = (d: number) => formatCurrency(Math.round(d * 100));
  const groups = new Map<string, number>();
  for (const l of lines) groups.set(l.groupName ?? "Other", (groups.get(l.groupName ?? "Other") ?? 0) + lineAmount(l, config.income));
  const planSummary = [
    `Money in per month: ${usd(totals.moneyIn)} (AJ take-home ${usd(config.income.hisNet)}, April ${usd(config.income.herNet)} — left out of the budget for now, Simon and Frank's rent share ${usd(config.income.boys)}, Meridian draw ${usd(config.income.draw)}).`,
    `Planned spending: ${usd(totals.out)} including a ${config.income.tithePct}% tithe of ${usd(totals.tithe)}; savings set aside ${usd(totals.savings)}.`,
    `Monthly gap: ${totals.net >= 0 ? "+" : "−"}${usd(Math.abs(totals.net))}.`,
    `By group: ${[...groups].sort((a, b) => b[1] - a[1]).map(([g, v]) => `${g} ${usd(v)}`).join(", ")}.`,
  ].join("\n");

  const balances = getBalances(now);
  const accountsSummary = balances
    .filter((a) => a.counted && a.syncing)
    .map((a) => `  - ${a.name} (${a.kind}): ${formatCurrency(a.balanceCents)}${a.kind === "card" ? " owed" : ""}`)
    .concat(balances.filter((a) => !a.syncing).map((a) => `  - ${a.name}: feed stopped, balance unknown`))
    .join("\n");

  const toDo = getSubscriptionToDo();
  const subscriptionsSummary = toDo.length
    ? toDo.map((t) => `  - ${t.action === "transfer" ? `Hand off to ${t.transferTo ?? "someone"}` : "Cancel"}: ${t.name} ${formatCurrency(t.monthlyCost)}/mo`).join("\n")
    : "Nothing waiting to cancel or hand off.";

  // Upcoming recurring bills
  const recurring = db
    .select()
    .from(schema.recurringTransactions)
    .where(eq(schema.recurringTransactions.isActive, true))
    .all()
    .filter((r) => r.nextDueDate && r.nextDueDate <= new Date(now.getTime() + 35 * 86400000).toLocaleDateString("en-CA"))
    .sort((a, b) => (a.nextDueDate ?? "").localeCompare(b.nextDueDate ?? ""));

  let upcomingBills = "No recurring bills detected.";
  if (recurring.length > 0) {
    const billLines = recurring.map(
      (r) => `  - ${r.merchant}: ${formatCurrency(r.amount)} ${r.frequency}${r.nextDueDate ? `, next due ${r.nextDueDate}` : ""}`
    );
    upcomingBills = `${recurring.length} scheduled in the next 35 days:\n${billLines.join("\n")}`;
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
  const debtDeadlines = getUpcomingDebtDeadlines();

  const snapshotParts: string[] = [];
  snapshotParts.push(`Total liquid balance: ${formatCurrency(balanceInfo.totalBalance)} across ${balanceInfo.accountCount} counted cash accounts.`);
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


  const liveStateSnapshot = snapshotParts.map((p) => `- ${p}`).join("\n");

  return {
    totalBalance: formatCurrency(balanceInfo.totalBalance),
    monthlySpending: formatCurrency(spending),
    monthlyIncome: formatCurrency(income),
    debtSummary,
    taxSummary,
    creditSummary,
    planSummary,
    accountsSummary,
    subscriptionsSummary,
    upcomingBills,
    budgetStatus,
    liveStateSnapshot,
  };
}

export function buildSystemPrompt(context: FinancialContext): string {
  const today = new Date().toLocaleDateString("en-CA");

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

## Who you're helping
- AJ (Ashaun) Jones, Operations at Navusoft Inc (W-2, paid the 15th and last day). Meridian Analytics closed Oct 27, 2026: no more owner's draws, but its 2026 tax tasks remain.
- Married to April on Sep 7, 2026. Household of 7 in Montgomery, TX (100 Harbour Town Dr) since Aug 31, 2026; the Atlanta lease ended Oct 21. Simon and Frank pay a share of the rent.
- April runs a booth-rental salon chair (her lines are paid from salon revenue; her income is left out of the budget for now). AJ's side income: iOS apps (PackRat, Trust) and consulting.
- Banks: Capital One (Simply Checking, 360 Checking, 360 Performance Savings), Chime, Navy Federal. Bank sync is SimpleFIN.
- Cars: 2022 Ford Maverick (Bridgecrest "Primary Car", $781/mo) and 2014 VW Tiguan (Bridgecrest "VW", $447/mo; per the plan Seth takes the Tiguan payment over from November once confirmed). Both are due the 16th; October's were paid late on Oct 29. Late payments report at 30 days past due.
- Apple Card and Capital One Platinum were paid off Oct 28, 2026. LendingPoint (~$15,272 on the April report) has no payments in any synced account and no plan line: its status is unknown.
- Uses Bud's pages: This month (/), Next month (/next), the budget (/budget, the shared household plan), a working budget for what-ifs (/budget/working), Balances, Subscriptions, Debts, Credit, Tax.

## Goals
1. Close the monthly gap in the household plan (see "Household plan" below) — this is the top priority.
2. Keep both car loans current every month; a new 30-day late mark is the most expensive credit mistake available.
3. Build a cash buffer — savings are nearly empty after the card payoffs.
4. Cut and hand off subscriptions (see the subscription to-do list).
5. Rebuild credit: dispute duplicates, then settle the small collections with deletion.

## Key context
- The household plan's lines are the budget; category budgets are derived from them. Suggest changes as plan-line changes (or a what-if on the working budget), not new budgets.
- Apple subscriptions all bill as "Apple"; the Subscriptions page tells them apart by price. Don't suggest cancelling something marked keep there.
- Round-ups on Chime are automatic transfers to savings, not subscriptions.
- MyPay cash advances are a debt trap; flag them if they reappear (none since Aug 2026).

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

**Household plan (the budget):**
${context.planSummary}

**Accounts:**
${context.accountsSummary}

**Subscriptions to act on:**
${context.subscriptionsSummary}

**Recurring bills:**
${context.upcomingBills}

**Budgets:**
${context.budgetStatus}

## Tax tracking disclaimer
You help track tax payments and plan cash flow around them. You are NOT a tax advisor. When first discussing taxes, include: "I can help track payments and plan cash flow, but for tax strategy or disputes, consult a CPA or enrolled agent."

## Credit coaching notes
- Utilization below 30% is a discrete score improvement threshold
- Utilization below 10% is even better
- Payment history is 35% of FICO score
- Hard inquiries fall off after 2 years
- Paying only the monthly amount on a past-due loan keeps it the same number of payments behind
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

Cutting dining to 4x/month ($200) frees up **$425/mo** — about a tenth of the monthly gap.

**Next step:** Want me to try a $200 dining line on the working budget?`;
}

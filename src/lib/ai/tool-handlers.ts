import { db, schema } from "@/lib/db";
import { eq, like, and, gte, lte, desc, sql } from "drizzle-orm";
import { newId } from "@/lib/utils/ids";
import { now, today, formatCurrency, parseDollarsToCents } from "@/lib/utils/format";
import { calculateDebtAllocation } from "@/lib/utils/debt-engine";
import { createTransaction, findAccountByQuery } from "@/lib/actions/transactions";
import { getMonthlyAllocationVsActual } from "@/lib/actions/debts";
import { getTaxOverview } from "@/lib/actions/taxes";

type ToolInput = Record<string, unknown>;

export async function handleToolCall(
  toolName: string,
  input: ToolInput
): Promise<string> {
  switch (toolName) {
    case "get_financial_overview":
      return handleGetFinancialOverview();
    case "add_transaction":
      return handleAddTransaction(input);
    case "search_transactions":
      return handleSearchTransactions(input);
    case "get_spending_summary":
      return handleGetSpendingSummary(input);
    case "set_budget":
      return handleSetBudget(input);
    case "get_budget_status":
      return handleGetBudgetStatus(input);
    case "add_debt":
      return handleAddDebt(input);
    case "log_debt_payment":
      return handleLogDebtPayment(input);
    case "get_debt_allocation":
      return handleGetDebtAllocation(input);
    case "summarize_debt_month":
      return handleSummarizeDebtMonth(input);
    case "summarize_tax_situation":
      return handleSummarizeTaxSituation();
    case "create_financial_plan":
      return handleCreateFinancialPlan(input);
    case "add_plan_line_item":
      return handleAddPlanLineItem(input);
    case "update_plan_item":
      return handleUpdatePlanItem(input);
    case "get_plan_summary":
      return handleGetPlanSummary(input);
    case "update_plan_savings":
      return handleUpdatePlanSavings(input);
    case "add_tax_obligation":
      return handleAddTaxObligation(input);
    case "log_tax_payment":
      return handleLogTaxPayment(input);
    case "log_credit_score":
      return handleLogCreditScore(input);
    case "create_savings_goal":
      return handleCreateSavingsGoal(input);
    case "update_savings_goal":
      return handleUpdateSavingsGoal(input);
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

// === QUERY HANDLERS ===

function handleGetFinancialOverview(): string {
  const debts = db.select().from(schema.debts).where(eq(schema.debts.status, "active")).all();
  const taxes = db.select().from(schema.taxObligations).where(eq(schema.taxObligations.status, "active")).all();
  const scores = db.select().from(schema.creditScores).orderBy(desc(schema.creditScores.date)).limit(3).all();
  const plans = db.select().from(schema.financialPlans).all();
  const goals = db.select().from(schema.savingsGoals).all();
  const accounts = db.select().from(schema.accounts).all();

  const monthStart = getMonthStart();
  const monthlySpending = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)` })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.type, "expense"), gte(schema.transactions.date, monthStart)))
    .get();
  const monthlyIncome = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)` })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.type, "income"), gte(schema.transactions.date, monthStart)))
    .get();

  return JSON.stringify({
    accounts: accounts.map((a) => ({
      name: a.name,
      institution: a.institution,
      type: a.subtype,
      last_four: a.lastFour,
      balance: a.balance != null ? formatCurrency(a.balance) : "unknown",
    })),
    this_month: {
      spending: formatCurrency(monthlySpending?.total ?? 0),
      income: formatCurrency(monthlyIncome?.total ?? 0),
    },
    debts: debts.map((d) => ({
      creditor: d.creditorName,
      type: d.type,
      balance: formatCurrency(d.currentBalance),
      rate: `${(d.interestRate * 100).toFixed(1)}%`,
      minimum: formatCurrency(d.minimumPayment),
      utilization: d.creditLimit
        ? `${Math.round((d.currentBalance / d.creditLimit) * 100)}%`
        : null,
    })),
    total_debt: formatCurrency(debts.reduce((s, d) => s + d.currentBalance, 0)),
    taxes: taxes.map((t) => ({
      agency: t.agency,
      type: t.type,
      year: t.taxYear,
      remaining: formatCurrency(t.remainingBalance),
      due_date: t.dueDate,
      installment: t.isInstallmentPlan ? formatCurrency(t.installmentAmount ?? 0) : null,
    })),
    credit_scores: scores.map((s) => ({ score: s.score, date: s.date, source: s.source })),
    plans: plans.map((p) => ({
      name: p.name,
      type: p.type,
      status: p.status,
      saved: formatCurrency(p.currentSaved),
      target: p.targetAmount ? formatCurrency(p.targetAmount) : null,
      target_date: p.targetDate,
    })),
    savings_goals: goals.map((g) => ({
      name: g.name,
      current: formatCurrency(g.currentAmount),
      target: formatCurrency(g.targetAmount),
      target_date: g.targetDate,
    })),
  });
}

function handleAddTransaction(input: ToolInput): string {
  const accountQuery = input.account as string | undefined;
  if (!accountQuery) return JSON.stringify({ error: "account is required" });

  const account = findAccountByQuery(accountQuery);
  if (!account) {
    return JSON.stringify({ error: `No account matched "${accountQuery}". Try the account name or last-four digits.` });
  }

  let categoryId: string | undefined;
  if (input.category) {
    const cat = db.select().from(schema.categories).where(like(schema.categories.name, `%${input.category as string}%`)).get();
    if (!cat) return JSON.stringify({ error: `Category "${input.category}" not found` });
    categoryId = cat.id;
  }

  // Default placeholder=true when account is Teller-connected and date is within 14 days.
  const date = (input.date as string | undefined) ?? today();
  const isRecent = Math.abs((Date.now() - new Date(date).getTime()) / 86400000) <= 14;
  const placeholderDefault = !!account.tellerAccountId && isRecent;
  const placeholder = (input.placeholder as boolean | undefined) ?? placeholderDefault;

  const result = createTransaction({
    accountId: account.id,
    amount: input.amount as number,
    type: input.type as "income" | "expense",
    description: input.description as string,
    date,
    categoryId,
    placeholder,
    placeholderTtlDays: input.placeholder_ttl_days as number | undefined,
  });

  if (!result.success) return JSON.stringify({ error: result.error });

  const amountFmt = formatCurrency(parseDollarsToCents(input.amount as number));
  const placeholderNote = placeholder
    ? " (placeholder — will auto-resolve when Teller syncs the matching transaction)"
    : "";
  return JSON.stringify({
    success: true,
    id: result.id,
    message: `Added ${input.type} of ${amountFmt} on ${account.name} for ${date}${placeholderNote}`,
  });
}

function handleSearchTransactions(input: ToolInput): string {
  const limit = Math.min((input.limit as number) || 20, 50);

  let query = db.select({
    id: schema.transactions.id,
    amount: schema.transactions.amount,
    type: schema.transactions.type,
    description: schema.transactions.description,
    merchant: schema.transactions.merchant,
    date: schema.transactions.date,
    status: schema.transactions.status,
    categoryId: schema.transactions.categoryId,
  }).from(schema.transactions);

  const conditions = [];
  if (input.merchant) conditions.push(like(schema.transactions.merchant, `%${input.merchant}%`));
  if (input.start_date) conditions.push(gte(schema.transactions.date, input.start_date as string));
  if (input.end_date) conditions.push(lte(schema.transactions.date, input.end_date as string));
  if (input.min_amount) conditions.push(gte(schema.transactions.amount, parseDollarsToCents(input.min_amount as number)));
  if (input.max_amount) conditions.push(lte(schema.transactions.amount, parseDollarsToCents(input.max_amount as number)));

  if (input.category) {
    const cat = db.select().from(schema.categories).where(like(schema.categories.name, `%${input.category}%`)).get();
    if (cat) conditions.push(eq(schema.transactions.categoryId, cat.id));
  }

  const results = conditions.length > 0
    ? db.select().from(schema.transactions).where(and(...conditions)).orderBy(desc(schema.transactions.date)).limit(limit).all()
    : db.select().from(schema.transactions).orderBy(desc(schema.transactions.date)).limit(limit).all();

  return JSON.stringify({
    count: results.length,
    transactions: results.map((t) => ({
      date: t.date,
      merchant: t.merchant ?? t.description,
      amount: formatCurrency(t.amount),
      type: t.type,
      status: t.status,
    })),
  });
}

function handleGetSpendingSummary(input: ToolInput): string {
  const startDate = (input.start_date as string) || getMonthStart();
  const endDate = (input.end_date as string) || today();

  const results = db
    .select({
      categoryId: schema.transactions.categoryId,
      total: sql<number>`SUM(${schema.transactions.amount})`,
      count: sql<number>`COUNT(*)`,
    })
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.type, "expense"),
        gte(schema.transactions.date, startDate),
        lte(schema.transactions.date, endDate)
      )
    )
    .groupBy(schema.transactions.categoryId)
    .all();

  const categories = db.select().from(schema.categories).all();
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  const breakdown = results.map((r) => ({
    category: catMap[r.categoryId ?? ""] ?? "Uncategorized",
    total: formatCurrency(r.total),
    transactions: r.count,
  }));

  const grandTotal = results.reduce((s, r) => s + r.total, 0);

  return JSON.stringify({
    period: `${startDate} to ${endDate}`,
    total_spending: formatCurrency(grandTotal),
    breakdown,
  });
}

// === BUDGET HANDLERS ===

function handleSetBudget(input: ToolInput): string {
  const catName = input.category as string;
  const amount = parseDollarsToCents(input.amount as number);

  const cat = db.select().from(schema.categories).where(like(schema.categories.name, `%${catName}%`)).get();
  if (!cat) return JSON.stringify({ error: `Category "${catName}" not found` });

  const existing = db.select().from(schema.budgets).where(eq(schema.budgets.categoryId, cat.id)).get();
  if (existing) {
    db.update(schema.budgets).set({ amount }).where(eq(schema.budgets.id, existing.id)).run();
    return JSON.stringify({ success: true, message: `Updated ${cat.name} budget to ${formatCurrency(amount)}/month` });
  }

  db.insert(schema.budgets).values({ id: newId(), categoryId: cat.id, amount, period: "monthly", createdAt: now() }).run();
  return JSON.stringify({ success: true, message: `Set ${cat.name} budget to ${formatCurrency(amount)}/month` });
}

function handleGetBudgetStatus(input: ToolInput): string {
  const monthStart = getMonthStart();
  const budgets = db.select().from(schema.budgets).all();

  if (budgets.length === 0) return JSON.stringify({ message: "No budgets set." });

  const statuses = budgets.map((b) => {
    const cat = b.categoryId
      ? db.select().from(schema.categories).where(eq(schema.categories.id, b.categoryId)).get()
      : null;

    if (input.category && cat && !cat.name.toLowerCase().includes((input.category as string).toLowerCase())) {
      return null;
    }

    const spent = db
      .select({ total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)` })
      .from(schema.transactions)
      .where(and(
        eq(schema.transactions.categoryId, b.categoryId ?? ""),
        gte(schema.transactions.date, monthStart),
        eq(schema.transactions.type, "expense")
      ))
      .get();

    const spentAmount = spent?.total ?? 0;
    const remaining = b.amount - spentAmount;
    const pct = b.amount > 0 ? Math.round((spentAmount / b.amount) * 100) : 0;

    return {
      category: cat?.name ?? "Overall",
      budget: formatCurrency(b.amount),
      spent: formatCurrency(spentAmount),
      remaining: formatCurrency(remaining),
      percent_used: `${pct}%`,
      status: pct >= 100 ? "OVER BUDGET" : pct >= 80 ? "WARNING" : "ON TRACK",
    };
  }).filter(Boolean);

  return JSON.stringify({ budgets: statuses });
}

// === DEBT HANDLERS ===

function handleAddDebt(input: ToolInput): string {
  const timestamp = now();
  const currentBalance = parseDollarsToCents(input.current_balance as number);
  const originalBalance = input.original_balance ? parseDollarsToCents(input.original_balance as number) : currentBalance;

  db.insert(schema.debts).values({
    id: newId(),
    creditorName: input.creditor_name as string,
    type: input.type as string,
    originalBalance: originalBalance,
    currentBalance: currentBalance,
    interestRate: (input.interest_rate as number) / 100,
    minimumPayment: parseDollarsToCents(input.minimum_payment as number),
    dueDay: (input.due_day as number) ?? null,
    creditLimit: input.credit_limit ? parseDollarsToCents(input.credit_limit as number) : null,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();

  return JSON.stringify({
    success: true,
    message: `Now tracking ${input.creditor_name}: ${formatCurrency(currentBalance)} at ${input.interest_rate}% APR`,
  });
}

function handleLogDebtPayment(input: ToolInput): string {
  const creditorName = input.creditor_name as string;
  const debt = db.select().from(schema.debts)
    .where(like(schema.debts.creditorName, `%${creditorName}%`))
    .get();

  if (!debt) return JSON.stringify({ error: `No debt found matching "${creditorName}"` });

  const paymentAmount = parseDollarsToCents(input.amount as number);
  const newBalance = Math.max(0, debt.currentBalance - paymentAmount);
  const paymentDate = (input.date as string) || today();
  const timestamp = now();

  db.insert(schema.debtPayments).values({
    id: newId(),
    debtId: debt.id,
    amount: paymentAmount,
    date: paymentDate,
    type: (input.type as string) || "extra",
    newBalance,
    createdAt: timestamp,
  }).run();

  db.update(schema.debts)
    .set({ currentBalance: newBalance, updatedAt: timestamp })
    .where(eq(schema.debts.id, debt.id))
    .run();

  if (newBalance === 0) {
    db.update(schema.debts).set({ status: "paid_off", updatedAt: timestamp }).where(eq(schema.debts.id, debt.id)).run();
  }

  const result: Record<string, unknown> = {
    success: true,
    creditor: debt.creditorName,
    payment: formatCurrency(paymentAmount),
    previous_balance: formatCurrency(debt.currentBalance),
    new_balance: formatCurrency(newBalance),
  };

  if (debt.creditLimit) {
    const oldUtil = Math.round((debt.currentBalance / debt.creditLimit) * 100);
    const newUtil = Math.round((newBalance / debt.creditLimit) * 100);
    result.utilization_change = `${oldUtil}% -> ${newUtil}%`;
    if (oldUtil > 30 && newUtil <= 30) {
      result.milestone = "Crossed below 30% utilization — expect a credit score improvement.";
    }
    if (oldUtil > 10 && newUtil <= 10) {
      result.milestone = "Crossed below 10% utilization — excellent for credit score.";
    }
  }

  if (newBalance === 0) {
    result.paid_off = true;
    result.message = `${debt.creditorName} is PAID OFF. Minimum payment of ${formatCurrency(debt.minimumPayment)}/mo is now freed up.`;
  }

  return JSON.stringify(result);
}

function handleGetDebtAllocation(input: ToolInput): string {
  const debts = db.select().from(schema.debts).where(eq(schema.debts.status, "active")).all();
  if (debts.length === 0) return JSON.stringify({ message: "No active debts to allocate." });

  const totalMinimums = debts.reduce((s, d) => s + d.minimumPayment, 0);
  const monthlyBudget = input.monthly_budget
    ? parseDollarsToCents(input.monthly_budget as number)
    : totalMinimums;

  // Get move plan for goal-unlocking factor
  const movePlan = db.select().from(schema.financialPlans).where(eq(schema.financialPlans.type, "move")).get();

  const allocation = calculateDebtAllocation(debts, monthlyBudget, movePlan ?? undefined);
  return JSON.stringify(allocation);
}

function handleSummarizeDebtMonth(input: ToolInput): string {
  const month = (input.month as string | undefined) ?? undefined;
  const summary = getMonthlyAllocationVsActual(month);

  if (summary.rows.length === 0) {
    return JSON.stringify({
      month: summary.month,
      message: "No active debts on file for this month.",
    });
  }

  // Build per-debt narrations + aggregate sentence
  const rows = summary.rows.map((r) => {
    const recommended = r.recommended;
    const actual = r.actualPaid;
    const delta = actual - recommended;
    let narration: string;
    if (r.status === "no_plan") {
      narration = `${r.creditorName}: no allocation row for ${summary.month}.`;
    } else if (r.status === "ahead") {
      narration = `${r.creditorName}: ${formatCurrency(actual)} paid (${r.paymentCount} payments) — ${formatCurrency(delta)} above the ${formatCurrency(recommended)} recommended.`;
    } else if (r.status === "on_track") {
      narration = `${r.creditorName}: ${formatCurrency(actual)} paid (${r.paymentCount} payments) — within 15% of the ${formatCurrency(recommended)} recommended.`;
    } else {
      narration = `${r.creditorName}: ${formatCurrency(actual)} paid (${r.paymentCount} payments) — ${formatCurrency(Math.abs(delta))} short of the ${formatCurrency(recommended)} recommended.`;
    }
    return {
      debtId: r.debtId,
      creditor: r.creditorName,
      recommended: formatCurrency(recommended),
      actual: formatCurrency(actual),
      delta_cents: delta,
      payment_count: r.paymentCount,
      status: r.status,
      narration,
    };
  });

  const totalDelta = summary.totalActual - summary.totalRecommended;
  const aggregate =
    summary.totalRecommended === 0
      ? `You've put ${formatCurrency(summary.totalActual)} toward debt this month.`
      : totalDelta >= 0
        ? `You've put ${formatCurrency(summary.totalActual)} toward debt this month, ${formatCurrency(totalDelta)} above the ${formatCurrency(summary.totalRecommended)} recommended.`
        : `You've put ${formatCurrency(summary.totalActual)} toward debt this month, ${formatCurrency(Math.abs(totalDelta))} short of the ${formatCurrency(summary.totalRecommended)} recommended.`;

  return JSON.stringify({
    month: summary.month,
    total_recommended: formatCurrency(summary.totalRecommended),
    total_actual: formatCurrency(summary.totalActual),
    aggregate_narration: aggregate,
    rows,
  });
}

function handleSummarizeTaxSituation(): string {
  const overview = getTaxOverview();

  if (overview.active.length === 0 && overview.paid.length === 0) {
    return JSON.stringify({
      message: "No tax obligations on file. Add one via the Tax page or 'add a tax obligation' in chat.",
    });
  }

  const rows = overview.active.map((o) => {
    const narration =
      o.remainingBalance === 0
        ? `${o.agency} ${o.taxYear}: paid in full.`
        : o.dueDate
          ? `${o.agency} ${o.taxYear} (${o.type.replace(/_/g, " ")}): ${formatCurrency(o.remainingBalance)} remaining of ${formatCurrency(o.originalAmount)} (${o.pctPaid}% paid). Due ${o.dueDate}.${o.isInstallmentPlan && o.installmentAmount ? ` Installment plan: ${formatCurrency(o.installmentAmount)}/mo.` : ""}`
          : `${o.agency} ${o.taxYear} (${o.type.replace(/_/g, " ")}): ${formatCurrency(o.remainingBalance)} remaining of ${formatCurrency(o.originalAmount)} (${o.pctPaid}% paid). No due date set.`;
    return {
      id: o.id,
      agency: o.agency,
      tax_year: o.taxYear,
      type: o.type,
      remaining: formatCurrency(o.remainingBalance),
      original: formatCurrency(o.originalAmount),
      paid_pct: o.pctPaid,
      due_date: o.dueDate,
      installment_plan: o.isInstallmentPlan,
      installment_amount: o.installmentAmount ? formatCurrency(o.installmentAmount) : null,
      penalty_rate: o.penaltyRate,
      narration,
    };
  });

  const aggregateParts = [
    `${formatCurrency(overview.totalOwed)} owed across ${overview.active.length} active ${overview.active.length === 1 ? "obligation" : "obligations"}.`,
    `${formatCurrency(overview.totalPaidYTD)} paid year-to-date in ${new Date().getFullYear()}.`,
  ];
  if (overview.nextDue) {
    aggregateParts.push(`Next due: ${overview.nextDue.agency} ${overview.nextDue.taxYear} on ${overview.nextDue.dueDate}.`);
  }

  return JSON.stringify({
    total_owed: formatCurrency(overview.totalOwed),
    total_paid_ytd: formatCurrency(overview.totalPaidYTD),
    next_due: overview.nextDue
      ? {
          agency: overview.nextDue.agency,
          tax_year: overview.nextDue.taxYear,
          due_date: overview.nextDue.dueDate,
          amount: formatCurrency(overview.nextDue.installmentAmount ?? overview.nextDue.remainingBalance),
        }
      : null,
    aggregate_narration: aggregateParts.join(" "),
    active: rows,
    paid_count: overview.paid.length,
  });
}

// === FINANCIAL PLAN HANDLERS ===

function handleCreateFinancialPlan(input: ToolInput): string {
  const timestamp = now();
  const id = newId();

  db.insert(schema.financialPlans).values({
    id,
    name: input.name as string,
    type: input.type as string,
    status: "planning",
    targetDate: (input.target_date as string) ?? null,
    targetAmount: input.target_amount ? parseDollarsToCents(input.target_amount as number) : null,
    currentSaved: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();

  return JSON.stringify({ success: true, plan_id: id, message: `Created plan "${input.name}"` });
}

function handleAddPlanLineItem(input: ToolInput): string {
  const planName = input.plan_name as string;
  const plan = db.select().from(schema.financialPlans).where(like(schema.financialPlans.name, `%${planName}%`)).get();
  if (!plan) return JSON.stringify({ error: `No plan found matching "${planName}"` });

  const count = db.select({ count: sql<number>`COUNT(*)` }).from(schema.planLineItems).where(eq(schema.planLineItems.planId, plan.id)).get();

  db.insert(schema.planLineItems).values({
    id: newId(),
    planId: plan.id,
    category: input.category as string,
    name: input.name as string,
    estimatedAmount: parseDollarsToCents(input.estimated_amount as number),
    isRequired: (input.is_required as boolean) ?? true,
    dueDate: (input.due_date as string) ?? null,
    sortOrder: (count?.count ?? 0) + 1,
    createdAt: now(),
  }).run();

  return JSON.stringify({ success: true, message: `Added "${input.name}" to "${plan.name}" — est. ${formatCurrency(parseDollarsToCents(input.estimated_amount as number))}` });
}

function handleUpdatePlanItem(input: ToolInput): string {
  const planName = input.plan_name as string;
  const plan = db.select().from(schema.financialPlans).where(like(schema.financialPlans.name, `%${planName}%`)).get();
  if (!plan) return JSON.stringify({ error: `No plan found matching "${planName}"` });

  const item = db.select().from(schema.planLineItems)
    .where(and(eq(schema.planLineItems.planId, plan.id), like(schema.planLineItems.name, `%${input.item_name as string}%`)))
    .get();
  if (!item) return JSON.stringify({ error: `No item found matching "${input.item_name}"` });

  const updates: Record<string, unknown> = {};
  if (input.is_paid !== undefined) updates.isPaid = input.is_paid;
  if (input.actual_amount !== undefined) updates.actualAmount = parseDollarsToCents(input.actual_amount as number);
  if (input.estimated_amount !== undefined) updates.estimatedAmount = parseDollarsToCents(input.estimated_amount as number);

  if (Object.keys(updates).length > 0) {
    db.update(schema.planLineItems).set(updates).where(eq(schema.planLineItems.id, item.id)).run();
  }

  return JSON.stringify({ success: true, message: `Updated "${item.name}" in "${plan.name}"` });
}

function handleGetPlanSummary(input: ToolInput): string {
  let plans;
  if (input.plan_name) {
    const plan = db.select().from(schema.financialPlans).where(like(schema.financialPlans.name, `%${input.plan_name as string}%`)).get();
    plans = plan ? [plan] : [];
  } else {
    plans = db.select().from(schema.financialPlans).all();
  }

  if (plans.length === 0) return JSON.stringify({ message: "No plans found." });

  const summaries = plans.map((plan) => {
    const items = db.select().from(schema.planLineItems).where(eq(schema.planLineItems.planId, plan.id)).orderBy(schema.planLineItems.sortOrder).all();
    const totalEstimated = items.reduce((s, i) => s + (i.estimatedAmount ?? 0), 0);
    const totalActual = items.filter((i) => i.isPaid).reduce((s, i) => s + (i.actualAmount ?? i.estimatedAmount ?? 0), 0);
    const paidCount = items.filter((i) => i.isPaid).length;

    return {
      name: plan.name,
      type: plan.type,
      status: plan.status,
      target_date: plan.targetDate,
      saved: formatCurrency(plan.currentSaved),
      target: plan.targetAmount ? formatCurrency(plan.targetAmount) : formatCurrency(totalEstimated),
      total_estimated: formatCurrency(totalEstimated),
      items_completed: `${paidCount}/${items.length}`,
      line_items: items.map((i) => ({
        name: i.name,
        category: i.category,
        estimated: formatCurrency(i.estimatedAmount ?? 0),
        actual: i.actualAmount ? formatCurrency(i.actualAmount) : null,
        paid: i.isPaid,
        required: i.isRequired,
        due_date: i.dueDate,
      })),
    };
  });

  return JSON.stringify({ plans: summaries });
}

function handleUpdatePlanSavings(input: ToolInput): string {
  const planName = input.plan_name as string;
  const plan = db.select().from(schema.financialPlans).where(like(schema.financialPlans.name, `%${planName}%`)).get();
  if (!plan) return JSON.stringify({ error: `No plan found matching "${planName}"` });

  const addAmount = parseDollarsToCents(input.amount as number);
  const newSaved = plan.currentSaved + addAmount;

  db.update(schema.financialPlans)
    .set({ currentSaved: newSaved, updatedAt: now() })
    .where(eq(schema.financialPlans.id, plan.id))
    .run();

  const target = plan.targetAmount ?? 0;
  const pct = target > 0 ? Math.round((newSaved / target) * 100) : 0;

  return JSON.stringify({
    success: true,
    plan: plan.name,
    added: formatCurrency(addAmount),
    total_saved: formatCurrency(newSaved),
    target: formatCurrency(target),
    progress: `${pct}%`,
  });
}

// === TAX HANDLERS ===

function handleAddTaxObligation(input: ToolInput): string {
  const timestamp = now();
  const amountOwed = parseDollarsToCents(input.amount_owed as number);

  db.insert(schema.taxObligations).values({
    id: newId(),
    type: input.type as string,
    taxYear: input.tax_year as number,
    originalAmount: amountOwed,
    remainingBalance: amountOwed,
    dueDate: (input.due_date as string) ?? null,
    agency: input.agency as string,
    isInstallmentPlan: (input.is_installment_plan as boolean) ?? false,
    installmentAmount: input.installment_amount ? parseDollarsToCents(input.installment_amount as number) : null,
    installmentDay: (input.installment_day as number) ?? null,
    penaltyRate: input.penalty_rate ? (input.penalty_rate as number) / 100 : null,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();

  return JSON.stringify({
    success: true,
    message: `Tracking ${input.agency} ${input.type} for ${input.tax_year}: ${formatCurrency(amountOwed)} owed`,
  });
}

function handleLogTaxPayment(input: ToolInput): string {
  const agency = input.agency as string;
  const taxYear = input.tax_year as number | undefined;

  let condition = like(schema.taxObligations.agency, `%${agency}%`);
  const obligation = taxYear
    ? db.select().from(schema.taxObligations).where(and(condition, eq(schema.taxObligations.taxYear, taxYear))).get()
    : db.select().from(schema.taxObligations).where(condition).get();

  if (!obligation) return JSON.stringify({ error: `No tax obligation found for "${agency}"` });

  const paymentAmount = parseDollarsToCents(input.amount as number);
  const newBalance = Math.max(0, obligation.remainingBalance - paymentAmount);
  const timestamp = now();

  db.insert(schema.taxPayments).values({
    id: newId(),
    obligationId: obligation.id,
    amount: paymentAmount,
    date: (input.date as string) || today(),
    confirmationNumber: (input.confirmation_number as string) ?? null,
    createdAt: timestamp,
  }).run();

  db.update(schema.taxObligations)
    .set({
      remainingBalance: newBalance,
      status: newBalance === 0 ? "paid" : "active",
      updatedAt: timestamp,
    })
    .where(eq(schema.taxObligations.id, obligation.id))
    .run();

  return JSON.stringify({
    success: true,
    agency: obligation.agency,
    payment: formatCurrency(paymentAmount),
    previous_balance: formatCurrency(obligation.remainingBalance),
    new_balance: formatCurrency(newBalance),
    paid_off: newBalance === 0,
  });
}

// === CREDIT HANDLERS ===

function handleLogCreditScore(input: ToolInput): string {
  const timestamp = now();
  const scoreDate = today();
  const scoreId = newId();

  db.insert(schema.creditScores).values({
    id: scoreId,
    score: input.score as number,
    bureau: (input.bureau as string) ?? null,
    source: (input.source as string) ?? null,
    date: scoreDate,
    createdAt: timestamp,
  }).run();

  if (input.utilization_ratio !== undefined || input.on_time_payments !== undefined || input.hard_inquiries !== undefined) {
    db.insert(schema.creditFactors).values({
      id: newId(),
      scoreId,
      utilizationRatio: input.utilization_ratio ? (input.utilization_ratio as number) / 100 : null,
      onTimePayments: (input.on_time_payments as number) ?? null,
      hardInquiries: (input.hard_inquiries as number) ?? null,
      createdAt: timestamp,
    }).run();
  }

  // Get previous score for comparison
  const previous = db.select().from(schema.creditScores)
    .orderBy(desc(schema.creditScores.date))
    .limit(1)
    .offset(1)
    .all();

  const result: Record<string, unknown> = {
    success: true,
    score: input.score,
    date: scoreDate,
  };

  if (previous.length > 0) {
    const diff = (input.score as number) - previous[0].score;
    result.change = diff;
    result.direction = diff > 0 ? "up" : diff < 0 ? "down" : "unchanged";
    result.previous_score = previous[0].score;
    result.previous_date = previous[0].date;
  }

  return JSON.stringify(result);
}

// === SAVINGS GOAL HANDLERS ===

function handleCreateSavingsGoal(input: ToolInput): string {
  const name = input.name as string;
  const targetAmount = parseDollarsToCents(input.target_amount as number);
  const currentAmount = input.current_amount ? parseDollarsToCents(input.current_amount as number) : 0;
  const targetDate = (input.target_date as string) || null;

  const id = newId();
  db.insert(schema.savingsGoals)
    .values({
      id,
      name,
      targetAmount,
      currentAmount,
      targetDate,
      createdAt: now(),
      updatedAt: now(),
    })
    .run();

  return JSON.stringify({
    success: true,
    goal: name,
    target: formatCurrency(targetAmount),
    saved: formatCurrency(currentAmount),
    target_date: targetDate,
  });
}

function handleUpdateSavingsGoal(input: ToolInput): string {
  const name = input.name as string;

  const goal = db
    .select()
    .from(schema.savingsGoals)
    .where(like(schema.savingsGoals.name, `%${name}%`))
    .get();

  if (!goal) {
    return JSON.stringify({ error: `No savings goal found matching "${name}"` });
  }

  const updates: Partial<{ currentAmount: number; targetAmount: number; targetDate: string | null; updatedAt: string }> = {
    updatedAt: now(),
  };

  if (input.add_amount) {
    updates.currentAmount = goal.currentAmount + parseDollarsToCents(input.add_amount as number);
  }
  if (input.target_amount) {
    updates.targetAmount = parseDollarsToCents(input.target_amount as number);
  }
  if (input.target_date) {
    updates.targetDate = input.target_date as string;
  }

  db.update(schema.savingsGoals)
    .set(updates)
    .where(eq(schema.savingsGoals.id, goal.id))
    .run();

  const updated = db.select().from(schema.savingsGoals).where(eq(schema.savingsGoals.id, goal.id)).get()!;

  return JSON.stringify({
    success: true,
    goal: updated.name,
    target: formatCurrency(updated.targetAmount),
    saved: formatCurrency(updated.currentAmount),
    progress: `${Math.round((updated.currentAmount / updated.targetAmount) * 100)}%`,
  });
}

// === HELPERS ===

function getMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

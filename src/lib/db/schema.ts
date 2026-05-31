import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ============================================================
// CORE TABLES
// ============================================================

export const categoryGroups = sqliteTable("category_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color"), // hex color for group
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"),
  color: text("color"), // hex color for charts
  groupId: text("group_id").references(() => categoryGroups.id),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const tellerEnrollments = sqliteTable("teller_enrollments", {
  id: text("id").primaryKey(),
  enrollmentId: text("enrollment_id").notNull().unique(),
  accessToken: text("access_token").notNull(), // encrypted
  institution: text("institution").notNull(), // "Capital One", "Chase", etc.
  createdAt: text("created_at").notNull(),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(), // "Chase Checking"
  institution: text("institution").notNull(), // "Chase"
  accountType: text("account_type").notNull(), // "depository" | "credit"
  subtype: text("subtype"), // "checking" | "savings" | "credit_card"
  lastFour: text("last_four"),
  currency: text("currency").notNull().default("USD"),
  balance: integer("balance"), // cents — current balance from Teller
  tellerAccountId: text("teller_account_id"), // external ID from Teller
  tellerEnrollmentId: text("teller_enrollment_id"),
  // when true, account's transactions are hidden from dashboard/reports.
  // incoming transfers FROM an excluded account still show on the receiving account.
  excludeFromReports: integer("exclude_from_reports", { mode: "boolean" }).notNull().default(false),
  lastSynced: text("last_synced"),
  createdAt: text("created_at").notNull(),
});

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(), // "business", "frivolous", etc.
  color: text("color").notNull().default("#6b7280"),
  createdAt: text("created_at").notNull(),
});

export const transactionTags = sqliteTable("transaction_tags", {
  id: text("id").primaryKey(),
  transactionId: text("transaction_id").notNull().references(() => transactions.id),
  tagId: text("tag_id").notNull().references(() => tags.id),
  createdAt: text("created_at").notNull(),
});

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  accountId: text("account_id").references(() => accounts.id),
  amount: integer("amount").notNull(), // cents, always positive — direction comes from `type`. Set by sync/teller.ts via Math.abs().
  type: text("type").notNull(), // "expense" | "income"
  description: text("description").notNull(), // raw bank description
  merchant: text("merchant"), // normalized merchant name (from Teller counterparty)
  categoryId: text("category_id").references(() => categories.id),
  date: text("date").notNull(), // ISO 8601 YYYY-MM-DD
  status: text("status").notNull().default("posted"), // "posted" | "pending"
  bankTransactionId: text("bank_transaction_id"), // Teller transaction ID for dedup
  isRecurring: integer("is_recurring", { mode: "boolean" }).notNull().default(false),
  // Origin of the row. "teller" = synced from bank, "manual" = user-entered authoritative,
  // "placeholder" = user-entered in anticipation of a Teller sync; auto-replaced when matching
  // Teller row arrives, or expires after placeholderExpiresAt.
  source: text("source").notNull().default("manual"),
  placeholderExpiresAt: text("placeholder_expires_at"),
  createdAt: text("created_at").notNull(),
});

export const budgets = sqliteTable("budgets", {
  id: text("id").primaryKey(),
  categoryId: text("category_id").references(() => categories.id),
  amount: integer("amount").notNull(), // cents
  period: text("period").notNull().default("monthly"), // "monthly" | "weekly"
  createdAt: text("created_at").notNull(),
});

export const recurringTransactions = sqliteTable("recurring_transactions", {
  id: text("id").primaryKey(),
  merchant: text("merchant").notNull(),
  amount: integer("amount").notNull(), // cents (approximate)
  frequency: text("frequency").notNull(), // "monthly" | "weekly" | "biweekly" | "yearly"
  categoryId: text("category_id").references(() => categories.id),
  accountId: text("account_id").references(() => accounts.id),
  nextDueDate: text("next_due_date"),
  lastSeenDate: text("last_seen_date"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  toolCalls: text("tool_calls"), // JSON string of tool calls/results
  createdAt: text("created_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(), // JSON string
  updatedAt: text("updated_at").notNull(),
});

// ============================================================
// FINANCIAL PLANNING TABLES
// ============================================================

export const financialPlans = sqliteTable("financial_plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // "move" | "debt_payoff" | "savings_goal" | "custom"
  status: text("status").notNull().default("planning"), // "planning" | "in_progress" | "completed" | "paused"
  targetDate: text("target_date"),
  targetAmount: integer("target_amount"), // cents
  currentSaved: integer("current_saved").notNull().default(0), // cents
  notes: text("notes"), // JSON
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Action-plan checklist items — strategic next steps the user is actively
 * working through (e.g. "set autopay on 5 debts", "cancel OpenAI"). Distinct
 * from `financial_plans` / `planLineItems` which model goal budgets like the
 * Houston move. These are short-horizon to-do items with status tracking.
 */
export const actionPlanItems = sqliteTable("action_plan_items", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  // Phase grouping for ordering: "now" | "this_week" | "this_month" | "ongoing"
  phase: text("phase").notNull().default("now"),
  status: text("status").notNull().default("pending"), // "pending" | "in_progress" | "completed" | "skipped"
  estimatedSavingsCents: integer("estimated_savings_cents"), // optional /mo impact
  link: text("link"), // optional internal route, e.g. "/debts"
  notes: text("notes"), // user notes
  sortOrder: integer("sort_order").notNull().default(0),
  dueAt: text("due_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
});

export const planLineItems = sqliteTable("plan_line_items", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull().references(() => financialPlans.id),
  category: text("category").notNull(), // "housing" | "moving_logistics" | "utilities" | "furniture" | "emergency"
  name: text("name").notNull(),
  estimatedAmount: integer("estimated_amount"), // cents
  actualAmount: integer("actual_amount"), // cents
  isPaid: integer("is_paid", { mode: "boolean" }).notNull().default(false),
  isRequired: integer("is_required", { mode: "boolean" }).notNull().default(true),
  dueDate: text("due_date"),
  sortOrder: integer("sort_order").notNull().default(0),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

// ============================================================
// DEBT TRACKING
// ============================================================

export const debts = sqliteTable("debts", {
  id: text("id").primaryKey(),
  creditorName: text("creditor_name").notNull(),
  type: text("type").notNull(), // "credit_card" | "personal_loan" | "student_loan" | "auto_loan" | "medical" | "tax_debt" | "other"
  originalBalance: integer("original_balance").notNull(), // cents
  currentBalance: integer("current_balance").notNull(), // cents
  interestRate: real("interest_rate").notNull(), // annual rate as decimal (0.2199 = 21.99%)
  minimumPayment: integer("minimum_payment").notNull(), // cents
  dueDay: integer("due_day"), // day of month 1-31
  creditLimit: integer("credit_limit"), // cents — for utilization calc on revolving debt
  status: text("status").notNull().default("active"), // "active" | "paid_off" | "in_collections" | "deferred"
  notes: text("notes"),
  // Optional one-off deadline tied to this debt — surfaced as a dashboard
  // banner when within 14 days. Useful for things like "$168.30 by 5/31 to
  // roll the 90-day-late mark back to 60-day on the credit report."
  nextActionDeadline: text("next_action_deadline"), // ISO YYYY-MM-DD
  nextActionAmount: integer("next_action_amount"), // cents
  nextActionNote: text("next_action_note"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const debtPayments = sqliteTable("debt_payments", {
  id: text("id").primaryKey(),
  debtId: text("debt_id").notNull().references(() => debts.id),
  amount: integer("amount").notNull(), // cents
  date: text("date").notNull(), // ISO date
  type: text("type").notNull(), // "minimum" | "extra" | "lump_sum"
  newBalance: integer("new_balance").notNull(), // cents — balance after payment
  notes: text("notes"),
  // Optional link to the Teller-synced transaction this payment corresponds to.
  // Nullable because not every payment has a matching bank row yet, and some
  // accounts aren't connected to Teller.
  linkedTransactionId: text("linked_transaction_id").references(() => transactions.id),
  createdAt: text("created_at").notNull(),
});

export const debtAllocations = sqliteTable("debt_allocations", {
  id: text("id").primaryKey(),
  month: text("month").notNull(), // "YYYY-MM"
  debtId: text("debt_id").notNull().references(() => debts.id),
  recommendedAmount: integer("recommended_amount").notNull(), // cents
  actualAmount: integer("actual_amount"), // cents — filled in after the fact
  reasoning: text("reasoning"), // why this allocation
  createdAt: text("created_at").notNull(),
});

// ============================================================
// TAX TRACKING
// ============================================================

export const taxObligations = sqliteTable("tax_obligations", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // "federal_income" | "state_income" | "back_taxes" | "estimated_quarterly" | "penalty" | "other"
  taxYear: integer("tax_year").notNull(),
  originalAmount: integer("original_amount").notNull(), // cents
  remainingBalance: integer("remaining_balance").notNull(), // cents
  dueDate: text("due_date"),
  isInstallmentPlan: integer("is_installment_plan", { mode: "boolean" }).notNull().default(false),
  installmentAmount: integer("installment_amount"), // cents per month
  installmentDay: integer("installment_day"), // day of month
  penaltyRate: real("penalty_rate"), // annual rate (IRS ~8%)
  agency: text("agency").notNull(), // "IRS" | "Texas Comptroller" | etc.
  referenceNumber: text("reference_number"),
  status: text("status").notNull().default("active"), // "upcoming" | "active" | "paid" | "overdue"
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const taxPayments = sqliteTable("tax_payments", {
  id: text("id").primaryKey(),
  obligationId: text("obligation_id").notNull().references(() => taxObligations.id),
  amount: integer("amount").notNull(), // cents
  date: text("date").notNull(),
  confirmationNumber: text("confirmation_number"),
  method: text("method"), // "direct_pay" | "eftps" | "check" | "payroll_deduction"
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

// ============================================================
// CREDIT SCORE TRACKING
// ============================================================

export const creditScores = sqliteTable("credit_scores", {
  id: text("id").primaryKey(),
  score: integer("score").notNull(), // 300-850
  bureau: text("bureau"), // "equifax" | "experian" | "transunion" | "fico" | "vantage"
  source: text("source"), // "Credit Karma" | "bank app" | etc.
  date: text("date").notNull(),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const creditFactors = sqliteTable("credit_factors", {
  id: text("id").primaryKey(),
  scoreId: text("score_id").notNull().references(() => creditScores.id),
  utilizationRatio: real("utilization_ratio"), // 0.0 to 1.0
  onTimePayments: integer("on_time_payments"), // consecutive months
  totalAccounts: integer("total_accounts"),
  hardInquiries: integer("hard_inquiries"), // last 2 years
  oldestAccountMonths: integer("oldest_account_months"),
  derogatoryMarks: integer("derogatory_marks"),
  totalBalance: integer("total_balance"), // cents
  totalCreditLimit: integer("total_credit_limit"), // cents
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

// ============================================================
// CREDIT REPORT TRIAGE
// ============================================================

export const creditReportItems = sqliteTable("credit_report_items", {
  id: text("id").primaryKey(),
  creditor: text("creditor").notNull(), // who currently owns/reports it
  originalCreditor: text("original_creditor"), // for collections — who held the original debt
  accountLast4: text("account_last4"),
  // category drives the section the item appears in
  category: text("category").notNull(), // "active" | "authorized_user" | "charge_off" | "collection"
  // status drives the action workflow
  status: text("status").notNull().default("negotiate"), // "pay" | "negotiate" | "settle" | "dispute" | "settled" | "removed" | "ignore"
  balanceCents: integer("balance_cents").notNull(),
  settlementOfferCents: integer("settlement_offer_cents"), // what user is offering / has offered
  settledAmountCents: integer("settled_amount_cents"), // actually paid to settle
  firstDelinquencyDate: text("first_delinquency_date"), // YYYY-MM — drives 7yr fall-off
  lastReportedDate: text("last_reported_date"),
  // Statute of limitations: derived from firstDelinquencyDate + state SoL years.
  // Stored explicitly so user can override per item.
  solDate: text("sol_date"), // YYYY-MM-DD — past this date, can't be sued for the debt
  fallOffDate: text("fall_off_date"), // YYYY-MM-DD — auto-removed from credit report
  // Likely to surface on Houston rental application background check
  moveRelevant: integer("move_relevant", { mode: "boolean" }).notNull().default(false),
  // Points at another item this is a duplicate of (e.g. Portfolio Recovery → Credit One)
  duplicateOfId: text("duplicate_of_id"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const creditSettlementBudget = sqliteTable("credit_settlement_budget", {
  id: text("id").primaryKey(),
  budgetCents: integer("budget_cents").notNull(),
  notes: text("notes"),
  updatedAt: text("updated_at").notNull(),
});

// ============================================================
// SAVINGS GOALS
// ============================================================

export const savingsGoals = sqliteTable("savings_goals", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  targetAmount: integer("target_amount").notNull(), // cents
  currentAmount: integer("current_amount").notNull().default(0), // cents
  targetDate: text("target_date"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

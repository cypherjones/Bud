import type Anthropic from "@anthropic-ai/sdk";

type Tool = Anthropic.Messages.Tool;

export const budTools: Tool[] = [
  // === QUERY TOOLS ===
  {
    name: "get_financial_overview",
    description:
      "Get a complete snapshot: account balances, debts, tax obligations, credit score, savings goals, and move plan status. Use this when the user asks for a general status update or you need full context.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "add_transaction",
    description:
      "Add a new transaction to an account. Use placeholder=true when the user is logging something they expect Teller to sync soon (paychecks, recent purchases on connected accounts) — the row will auto-resolve to the Teller-synced version on the next sync. Use placeholder=false for authoritative manual entries on accounts that don't sync via Teller. Always confirm the account by name or last-four when ambiguous.",
    input_schema: {
      type: "object" as const,
      properties: {
        account: {
          type: "string",
          description: "Account name fragment or last-four digits (e.g. 'Chime', '1387', 'Simply Checking')",
        },
        amount: {
          type: "number",
          description: "Amount in dollars (always positive, sign comes from `type`)",
        },
        type: {
          type: "string",
          enum: ["income", "expense"],
          description: "Whether money came in (income) or went out (expense)",
        },
        description: {
          type: "string",
          description: "What this transaction is for (e.g. 'Apr 30 Navusoft paycheck', 'Target groceries')",
        },
        date: {
          type: "string",
          description: "ISO date YYYY-MM-DD; defaults to today",
        },
        category: {
          type: "string",
          description: "Optional Bud category name. If omitted, the merchant/description is auto-categorized.",
        },
        placeholder: {
          type: "boolean",
          description: "True if expecting Teller to bring this in soon (will auto-resolve on next sync). Default true for Teller-connected accounts when date is within 14 days.",
        },
        placeholder_ttl_days: {
          type: "number",
          description: "Days before placeholder expires (default 14). Only used when placeholder=true.",
        },
      },
      required: ["account", "amount", "type", "description"],
    },
  },
  {
    name: "search_transactions",
    description:
      "Search transactions by merchant, category, date range, or amount range. Returns matching transactions.",
    input_schema: {
      type: "object" as const,
      properties: {
        merchant: {
          type: "string",
          description: "Merchant name to search (partial match)",
        },
        category: {
          type: "string",
          description: "Category name to filter by",
        },
        start_date: {
          type: "string",
          description: "Start date (YYYY-MM-DD)",
        },
        end_date: {
          type: "string",
          description: "End date (YYYY-MM-DD)",
        },
        min_amount: {
          type: "number",
          description: "Minimum amount in dollars",
        },
        max_amount: {
          type: "number",
          description: "Maximum amount in dollars",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 20)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_spending_summary",
    description:
      "Get spending breakdown by category for a given time period. Returns total per category and overall total.",
    input_schema: {
      type: "object" as const,
      properties: {
        start_date: {
          type: "string",
          description: "Start date (YYYY-MM-DD). Defaults to start of current month.",
        },
        end_date: {
          type: "string",
          description: "End date (YYYY-MM-DD). Defaults to today.",
        },
      },
      required: [],
    },
  },

  // === BUDGET TOOLS ===
  {
    name: "set_budget",
    description:
      "Create or update a monthly budget for a spending category.",
    input_schema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          description: "Category name (e.g. 'Groceries', 'Dining')",
        },
        amount: {
          type: "number",
          description: "Monthly budget amount in dollars",
        },
      },
      required: ["category", "amount"],
    },
  },
  {
    name: "get_budget_status",
    description:
      "Check current spending vs budget for all categories or a specific one.",
    input_schema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          description: "Specific category to check, or omit for all",
        },
      },
      required: [],
    },
  },

  // === DEBT TOOLS ===
  {
    name: "add_debt",
    description:
      "Start tracking a new debt. Requires creditor name, current balance, interest rate, and minimum payment.",
    input_schema: {
      type: "object" as const,
      properties: {
        creditor_name: { type: "string", description: "Who the debt is owed to" },
        type: {
          type: "string",
          enum: ["credit_card", "personal_loan", "student_loan", "auto_loan", "medical", "tax_debt", "other"],
          description: "Type of debt",
        },
        current_balance: { type: "number", description: "Current balance in dollars" },
        original_balance: { type: "number", description: "Original balance in dollars (if known)" },
        interest_rate: { type: "number", description: "Annual interest rate as percentage (e.g. 21.99)" },
        minimum_payment: { type: "number", description: "Monthly minimum payment in dollars" },
        due_day: { type: "number", description: "Day of month payment is due (1-31)" },
        credit_limit: { type: "number", description: "Credit limit in dollars (for credit cards)" },
      },
      required: ["creditor_name", "type", "current_balance", "interest_rate", "minimum_payment"],
    },
  },
  {
    name: "log_debt_payment",
    description:
      "Record a payment made toward a debt. Updates the balance.",
    input_schema: {
      type: "object" as const,
      properties: {
        creditor_name: { type: "string", description: "Name of the creditor (used to find the debt)" },
        amount: { type: "number", description: "Payment amount in dollars" },
        date: { type: "string", description: "Payment date (YYYY-MM-DD), defaults to today" },
        type: {
          type: "string",
          enum: ["minimum", "extra", "lump_sum"],
          description: "Type of payment",
        },
      },
      required: ["creditor_name", "amount"],
    },
  },
  {
    name: "get_debt_allocation",
    description:
      "Get the smart debt payoff allocation for the current month. Shows how much to pay each debt and why.",
    input_schema: {
      type: "object" as const,
      properties: {
        monthly_budget: {
          type: "number",
          description: "Total monthly amount available for all debt payments in dollars. If omitted, uses sum of all minimums.",
        },
      },
      required: [],
    },
  },
  {
    name: "summarize_debt_month",
    description:
      "Compare the recommended debt allocation to what was actually paid in a given month. Returns per-debt rows (recommended cents, actual cents, status: ahead/on_track/behind/no_plan) plus an aggregate sentence. Use this when the user asks 'how am I doing on debt this month' or wants concrete numbers vs. plan, not generic advice.",
    input_schema: {
      type: "object" as const,
      properties: {
        month: {
          type: "string",
          description: "Month in YYYY-MM format. Defaults to current month.",
        },
      },
      required: [],
    },
  },

  {
    name: "summarize_tax_situation",
    description:
      "Get a snapshot of all tax obligations: total owed, paid year-to-date, next due date, and per-obligation status (active/paid). Use this when the user asks 'how am I doing on taxes' or wants concrete numbers — not generic advice. Returns specific dollar amounts and dates.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },

  // === FINANCIAL PLAN TOOLS ===
  {
    name: "create_financial_plan",
    description:
      "Create a new financial plan (e.g., Houston move, savings goal). Returns the plan ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Plan name (e.g. 'Houston Move')" },
        type: {
          type: "string",
          enum: ["move", "debt_payoff", "savings_goal", "custom"],
          description: "Type of plan",
        },
        target_date: { type: "string", description: "Target completion date (YYYY-MM-DD)" },
        target_amount: { type: "number", description: "Target amount in dollars" },
      },
      required: ["name", "type"],
    },
  },
  {
    name: "add_plan_line_item",
    description:
      "Add a cost/task line item to an existing financial plan.",
    input_schema: {
      type: "object" as const,
      properties: {
        plan_name: { type: "string", description: "Name of the plan to add item to" },
        category: { type: "string", description: "Category (e.g. 'housing', 'moving_logistics', 'utilities', 'furniture', 'emergency')" },
        name: { type: "string", description: "Item name (e.g. 'Security Deposit')" },
        estimated_amount: { type: "number", description: "Estimated cost in dollars" },
        is_required: { type: "boolean", description: "Whether this is essential vs nice-to-have" },
        due_date: { type: "string", description: "When this needs to be paid (YYYY-MM-DD)" },
      },
      required: ["plan_name", "category", "name", "estimated_amount"],
    },
  },
  {
    name: "update_plan_item",
    description:
      "Update a line item in a financial plan — mark as paid, update estimate, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        plan_name: { type: "string", description: "Plan name" },
        item_name: { type: "string", description: "Line item name" },
        is_paid: { type: "boolean", description: "Mark as paid" },
        actual_amount: { type: "number", description: "Actual amount paid in dollars" },
        estimated_amount: { type: "number", description: "Updated estimate in dollars" },
      },
      required: ["plan_name", "item_name"],
    },
  },
  {
    name: "get_plan_summary",
    description:
      "Get full details of a financial plan including all line items and progress.",
    input_schema: {
      type: "object" as const,
      properties: {
        plan_name: { type: "string", description: "Plan name, or omit for all plans" },
      },
      required: [],
    },
  },
  {
    name: "update_plan_savings",
    description: "Add to the saved amount for a financial plan.",
    input_schema: {
      type: "object" as const,
      properties: {
        plan_name: { type: "string", description: "Plan name" },
        amount: { type: "number", description: "Amount to add in dollars" },
      },
      required: ["plan_name", "amount"],
    },
  },

  // === TAX TOOLS ===
  {
    name: "add_tax_obligation",
    description:
      "Start tracking a tax obligation (federal, state, back taxes, etc.).",
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: ["federal_income", "state_income", "back_taxes", "estimated_quarterly", "penalty", "other"],
        },
        tax_year: { type: "number", description: "Tax year (e.g. 2024)" },
        amount_owed: { type: "number", description: "Total amount owed in dollars" },
        due_date: { type: "string", description: "Due date (YYYY-MM-DD)" },
        agency: { type: "string", description: "Agency name (e.g. 'IRS')" },
        is_installment_plan: { type: "boolean", description: "On an installment agreement?" },
        installment_amount: { type: "number", description: "Monthly installment in dollars" },
        installment_day: { type: "number", description: "Day of month installment is due" },
        penalty_rate: { type: "number", description: "Annual penalty/interest rate as percentage" },
      },
      required: ["type", "tax_year", "amount_owed", "agency"],
    },
  },
  {
    name: "log_tax_payment",
    description: "Record a payment toward a tax obligation.",
    input_schema: {
      type: "object" as const,
      properties: {
        agency: { type: "string", description: "Agency name (used to find obligation)" },
        tax_year: { type: "number", description: "Tax year" },
        amount: { type: "number", description: "Payment amount in dollars" },
        date: { type: "string", description: "Payment date (YYYY-MM-DD)" },
        confirmation_number: { type: "string", description: "Payment confirmation number" },
      },
      required: ["agency", "amount"],
    },
  },

  // === SAVINGS GOAL TOOLS ===
  {
    name: "create_savings_goal",
    description: "Create a new savings goal to track progress toward a target amount.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Goal name (e.g. 'Emergency Fund', 'New Car')" },
        target_amount: { type: "number", description: "Target amount in dollars" },
        current_amount: { type: "number", description: "Amount already saved in dollars (default 0)" },
        target_date: { type: "string", description: "Target date to reach the goal (YYYY-MM-DD)" },
      },
      required: ["name", "target_amount"],
    },
  },
  {
    name: "update_savings_goal",
    description: "Update a savings goal — add to saved amount, change target, or mark complete.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Goal name to find" },
        add_amount: { type: "number", description: "Amount to add to current savings in dollars" },
        target_amount: { type: "number", description: "New target amount in dollars (if changing)" },
        target_date: { type: "string", description: "New target date (YYYY-MM-DD)" },
      },
      required: ["name"],
    },
  },

  // === CREDIT TOOLS ===
  {
    name: "log_credit_score",
    description: "Record a new credit score entry with optional factors.",
    input_schema: {
      type: "object" as const,
      properties: {
        score: { type: "number", description: "Credit score (300-850)" },
        bureau: {
          type: "string",
          enum: ["equifax", "experian", "transunion", "fico", "vantage"],
        },
        source: { type: "string", description: "Where you got the score (e.g. 'Credit Karma')" },
        utilization_ratio: { type: "number", description: "Credit utilization as percentage (e.g. 32 for 32%)" },
        on_time_payments: { type: "number", description: "Consecutive months of on-time payments" },
        hard_inquiries: { type: "number", description: "Hard inquiries in last 2 years" },
      },
      required: ["score"],
    },
  },
];

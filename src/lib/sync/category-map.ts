import { db, schema } from "@/lib/db";
import { like } from "drizzle-orm";

/**
 * Map Teller's transaction categories to Bud's internal category IDs.
 * Teller provides ~25 categories. We map them to our seeded categories.
 */
const TELLER_TO_BUD: Record<string, string> = {
  // Teller category -> Bud category name
  accommodation: "Housing",
  advertising: "Other",
  bar: "Dining",
  charity: "Other",
  clothing: "Shopping",
  dining: "Dining",
  education: "Other",
  electronics: "Shopping",
  entertainment: "Entertainment",
  fuel: "Transport",
  general: "Other",
  groceries: "Groceries",
  health: "Health",
  home: "Housing",
  income: "Income",
  insurance: "Bills & Utilities",
  investment: "Other",
  loan: "Debt Payment",
  office: "Other",
  phone: "Bills & Utilities",
  service: "Other",
  shopping: "Shopping",
  software: "Subscriptions",
  sport: "Entertainment",
  tax: "Taxes",
  transport: "Transport",
  transportation: "Transport",
  utilities: "Bills & Utilities",
};

// Cache category lookups
const categoryIdCache: Record<string, string | null> = {};

function getCategoryId(budCategoryName: string): string | null {
  if (budCategoryName in categoryIdCache) {
    return categoryIdCache[budCategoryName];
  }

  const cat = db
    .select()
    .from(schema.categories)
    .where(like(schema.categories.name, budCategoryName))
    .get();

  const id = cat?.id ?? null;
  categoryIdCache[budCategoryName] = id;
  return id;
}

/**
 * Merchant name patterns → Bud category.
 * Checked when Teller's own category is missing or too generic.
 *
 * Income-only patterns (only applied when the transaction is income, not an expense)
 * are kept in INCOME_PATTERNS below so they don't catch outgoing rows that share
 * the same merchant string (e.g. MyPay repayment outflow vs. MyPay advance inflow).
 */
const MERCHANT_PATTERNS: [RegExp, string][] = [
  // Groceries
  [/\bh\s*e\s*b\b|walmart|kroger|aldi|trader joe|whole foods|instacart|publix/i, "Groceries"],
  [/\btarget\b/i, "Groceries"],
  [/buc\s*ee/i, "Groceries"],

  // Dining
  [/\buchi\b|hopdoddy|polvos|sombrero|mint thai|kura|caffvino|josephines|la la land|starbucks|thesis/i, "Dining"],

  // Transport / Gas
  [/\bmurphy\b|exxon|shell|chevron|marathon|buc-ee/i, "Transport"],
  [/car wash/i, "Transport"],

  // Subscriptions
  [/netflix|hulu|spotify|disney\+|youtube|apple\s*(tv|music|one)|amazon prime|openai|midjourney|dropbox|mega limited|tradingview|excalidraw|nytimes|coinbase|robinhood|rocket lawyer/i, "Subscriptions"],
  [/zoho/i, "Subscriptions"],
  [/alpacadb|tiingo/i, "Subscriptions"],
  [/openart/i, "Subscriptions"],
  [/atlassian/i, "Subscriptions"],
  [/onlyfans/i, "Subscriptions"],

  // Bills & Utilities
  [/georgia power|power company|electric|water|gas co|at&t|\bat\b.*mobile|verizon|t-mobile|comcast|spectrum|xfinity/i, "Bills & Utilities"],
  [/next insur|renters.*ins|condo ins/i, "Bills & Utilities"],

  // Housing
  [/rent|mortgage|apartment|property mgmt/i, "Housing"],

  // Debt / Loans
  [/flexible finance|loan payment|past due fee/i, "Debt Payment"],
  [/\bflex\b/i, "Debt Payment"],
  [/mypay\s*(repayment|repay|instant advance fees?|fees?)/i, "Loan Payment"],

  // Shopping
  [/nordstrom|amazon mktpl|barnes.*noble|half price books|papier|buchanans native/i, "Shopping"],
  [/vapor\b/i, "Shopping"],

  // Transfers (internal moves) — captures "Deposit from <own bank>" and "Transfer Withdrawal To ...XXXX"
  [/withdrawal to|transfer from|transfer to|transfer withdrawal|round up|moved to chime|moved from checking/i, "Transfers"],
  [/deposit from\s+(capital one|simply checking|360|business basic|chime|navy fed|membership share|everyday)/i, "Transfers"],

  // P2P
  [/apple cash|venmo|zelle|cashapp/i, "Peer-to-Peer"],

  // Additional restaurants
  [/black walnut|barnab|common bond|conroe lake|goat city|jus mac|greaks|froberg|emma.s pub/i, "Restaurants"],

  // Additional gas
  [/shell|circle k|racetrac|\bqt\b/i, "Gas & Fuel"],

  // Additional
  [/supabase|pantheon|kinsta|digitalocean|littlebird|proton/i, "SaaS & Dev Tools"],
  [/geico/i, "Auto Insurance"],
  [/bridgecrest/i, "Car Payment"],
  [/afterpay/i, "Loan Payment"],
  [/experian/i, "Subscriptions"],
  [/doordash/i, "Subscriptions"],
  [/anthropic/i, "AI Tools"],
  [/xbox|game pass/i, "Gaming"],
  [/peacock/i, "Streaming"],
  [/disney/i, "Streaming"],
  [/spotify/i, "Streaming"],
  [/bloomberg/i, "News & Media"],
  [/kindle/i, "Subscriptions"],
  [/publix|kroger/i, "Groceries"],
  [/chick.fil|whataburger|pizza hut|dunkin/i, "Fast Food"],
  [/marta breeze/i, "Transport"],
];

/** Patterns applied only when the transaction is income (positive cash inflow). */
const INCOME_PATTERNS: [RegExp, string][] = [
  [/\bpayroll\b|direct dep|paycheck/i, "Paycheck"],
  [/mypay/i, "Cash Advance"],
  [/interest (paid|earned|credit)/i, "Income"],
  // bare "C - Deposit" is how Chime renders Navusoft direct-deposit lines
  [/^c\s*-?\s*(deposit)?$/i, "Paycheck"],
];

/**
 * Given a Teller category string (or null) and a merchant/description,
 * return the matching Bud category ID. The `isExpense` flag steers the
 * mapping for merchants that appear on both sides (e.g. MyPay).
 */
export function mapTellerCategory(
  tellerCategory: string | null,
  merchant?: string | null,
  description?: string | null,
  isExpense: boolean = true,
): string | null {
  const text = `${merchant ?? ""} ${description ?? ""}`;

  // For income rows, try income-only patterns first so we don't fall through to
  // generic merchant rules that would mis-tag the deposit.
  if (!isExpense) {
    for (const [pattern, budName] of INCOME_PATTERNS) {
      if (pattern.test(text)) {
        return getCategoryId(budName);
      }
    }
  }

  // First try Teller's own category if it's specific enough
  if (tellerCategory) {
    const budName = TELLER_TO_BUD[tellerCategory.toLowerCase()];
    if (budName && budName !== "Other") {
      return getCategoryId(budName);
    }
  }

  // Fall back to merchant/description pattern matching
  for (const [pattern, budName] of MERCHANT_PATTERNS) {
    if (pattern.test(text)) {
      return getCategoryId(budName);
    }
  }

  // If Teller had a category that mapped to something, use it
  if (tellerCategory) {
    const budName = TELLER_TO_BUD[tellerCategory.toLowerCase()];
    if (budName) return getCategoryId(budName);
  }

  return getCategoryId("Other");
}

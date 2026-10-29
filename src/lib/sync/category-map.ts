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
  bar: "Restaurants",
  charity: "Other",
  clothing: "Shopping",
  dining: "Restaurants",
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
  // Convenience stores — regional chains commonly miscategorized to "Other"
  [/honey\s*farms|wawa|sheetz|7[\s-]?eleven|cumberland\s*farms/i, "Groceries"],
  [/costco\s*gas/i, "Gas & Fuel"],
  [/costco/i, "Groceries"],

  // === HOUSEHOLD PLAN LINES (Oct 2026) ===
  // These land in the exact categories the plan lines track, so the budget
  // page and the dashboard compare like with like.
  [/stephanie burger/i, "Housing"], // Rent — 100 Harbour Town Dr
  [/entergy|georgia power|power company|electric|hays montgomery|\bmud\b|water/i, "Utilities"],
  [/comcast|xfinity|spectrum|tachus|optimum/i, "Internet"],
  [/\bat\s*&?\s*t\b|at t bill|verizon|t-mobile/i, "Phone"],
  [/promise land|daycare|kindercare|childcare/i, "Kids & Childcare"],
  [/petco|pettable|chewy|petsmart/i, "Pets"],
  [/rare carat/i, "Loan Payment"], // ring lease
  [/^irs\b/i, "Taxes"],
  [/interest charge|late fee/i, "Late Fees & Interest"],
  [/discount tire|o'?reilly auto|autozone|jiffy lube|firestone|pep boys/i, "Car Care"],
  [/\bcvs\b|walgreens|capsule pharmacy/i, "Pharmacy"],
  [/home depot|lowe'?s/i, "Home & Garden"],
  [/^capital one\s+capital one$/i, "Debt Payment"], // card payment from 360 Checking
  [/applecard|apple credit card|gs\s*bank/i, "Debt Payment"],
  [/^chime\s+chime$/i, "Transfers"], // moving money to the Chime account
  [/coffee|mcdonald|tapatia|tutti frutti|365 retail|mcalister|enchilada|chipotle|wendy'?s|taco bell|sonic drive/i, "Restaurants"],
  [/linkedin/i, "Subscriptions"],
  [/granola inc|livingwriter/i, "SaaS & Dev Tools"],

  // Restaurants — merged category (was split into Restaurants/Dining/Fast Food).
  // All eating-out merchants now route here regardless of cuisine/format.
  [/\buchi\b|hopdoddy|polvos|sombrero|mint thai|kura|caffvino|josephines|la la land|starbucks|thesis/i, "Restaurants"],

  // Gas — the plan's "Fuel" line tracks Gas & Fuel; tolls stay in Transport.
  [/\bmurphy\b|exxon|shell|chevron|marathon|buc-ee|quiktrip|race\s*trac|circle\s*k|valero|texaco/i, "Gas & Fuel"],
  [/car wash/i, "Transport"],
  // Toll roads (HCTRA = Houston, EZPass / FasTrak / SunPass = various states)
  [/hctra|ez\s?pass|ezpass|fastrak|sunpass|\btoll(s|way)?\b/i, "Transport"],
  // DMV / vehicle registration
  [/\b(mvd|dmv)\b|dept of motor|tag office|vehicle registration/i, "Transport"],

  // === SPECIFIC SUBSCRIPTION SUBCATEGORIES ===
  // Order matters — first match wins. Specific subcat patterns must precede
  // the generic "Subscriptions" catchall below, or everything would lump into
  // the generic bucket and the user's per-subcat budgets (Streaming, AI Tools,
  // SaaS, Web Hosting) would always read $0.

  // Streaming — video + music + TV/box services
  [/netflix|hulu|disney\+|disney plus|peacock|paramount\+|hbo\s*max|apple\s*tv|apple\s*music|apple\s*one|youtube\s*(premium|music|tv)|spotify|tidal|pandora|sirius/i, "Streaming"],

  // AI Tools — frontier models + AI-specific products
  [/openai|chatgpt|anthropic|claude|midjourney|runway|elevenlabs|character\.ai|perplexity|copilot|cursor|replit/i, "AI Tools"],
  [/openart/i, "AI Tools"],

  // Cloud Storage — file sync / backup services
  [/dropbox|icloud|onedrive|google\s*drive|google\s*one|backblaze|carbonite|mega\s*limited|sync\.com|pcloud/i, "Cloud Storage"],

  // Web Hosting — server / hosting / infra
  [/digitalocean|kinsta|pantheon|vercel|netlify|cloudflare|wpengine|bluehost|siteground|hetzner|linode|aws/i, "Web Hosting"],

  // SaaS & Dev Tools — productivity, dev, business software
  [/supabase|notion|linear|figma|github|gitlab|atlassian|jira|confluence|trello|asana|monday\.com|airtable|zapier|tradingview|excalidraw|alpacadb|tiingo|microsoft\s*\*?\s*microsoft|microsoft\s*365|office\s*365|zoho|littlebird|proton/i, "SaaS & Dev Tools"],

  // News & Media
  [/nytimes|new york times|wall\s*street\s*journal|wsj|bloomberg|economist|washington\s*post|atlantic|substack/i, "News & Media"],

  // Books & Education — reading + learning subscriptions
  [/audible|kindle\s*unlimited|kindle\s*unltd|kobo|scribd|coursera|udemy|masterclass|pluralsight|skillshare|brilliant/i, "Books & Education"],

  // Gaming
  [/xbox|game pass|playstation|nintendo|steam|epic\s*games/i, "Gaming"],

  // DoorDash — DashPass is a sub; everything else is fast food.
  [/doordash\s*dashpass|dashpass/i, "Subscriptions"],
  [/doordash/i, "Restaurants"],

  // Adult / niche
  [/onlyfans/i, "Adult Content"],

  // Generic / catch-all. Anything that didn't match a specific subcategory above
  // lands here. Apple-com-bill bundled charges that aren't recognizable as
  // Streaming/AI/Cloud/etc. fall through to this bucket — user re-categorizes
  // those manually since we can't tell which Apple service is which from the
  // bank string alone.
  [/amazon prime|coinbase|robinhood|rocket lawyer|crunchyroll|target circle/i, "Subscriptions"],
  [/^apple\s+apple$/i, "Subscriptions"], // bare App Store line
  [/^amazon\b/i, "Shopping"],

  // Insurance
  [/next insur|renters.*ins|condo ins|lemonade/i, "Insurance"],

  // Housing — Flex (FLEXIBLE FINANCE INC) is a rent-installment service, not a loan
  [/rent|mortgage|apartment|property mgmt|flexible finance/i, "Housing"],

  // Debt / Loans — credit-card mobile payment strings (Capital One, Chase, etc.)
  // need to distinguish from card *purchases*, which is why we anchor on PYMT/PAYMENT.
  [/capital one\s+(mobile\s+)?(pymt|payment)|chase\s+(card)?\s*payment|discover\s+payment|amex\s+(epayment|payment)/i, "Debt Payment"],
  [/loan payment|past due fee/i, "Debt Payment"],
  [/mypay\s*(repayment|repay|instant advance fees?|fees?)/i, "Loan Payment"],

  // Shopping
  [/nordstrom|amazon mktpl|barnes.*noble|half price books|papier|buchanans native/i, "Shopping"],
  [/vapor\b/i, "Shopping"],

  // Transfers (internal moves) — captures "Deposit from <own bank>" and "Transfer Withdrawal To ...XXXX"
  [/withdrawal to|transfer from|transfer to|transfer withdrawal|round up|moved to chime|moved (from|to) checking/i, "Transfers"],
  [/deposit from\s+(capital one|simply checking|360|business basic|chime|navy fed|membership share|everyday)/i, "Transfers"],

  // P2P
  [/apple cash|venmo|zelle|cashapp/i, "Peer-to-Peer"],

  // Additional restaurants
  [/black walnut|barnab|common bond|conroe lake|goat city|jus mac|greaks|froberg|emma.s pub/i, "Restaurants"],

  // Additional gas
  [/\bqt\b/i, "Gas & Fuel"],

  // Other recurring services that didn't fit cleanly above
  [/experian/i, "SaaS & Dev Tools"], // credit monitoring — closest fit

  // Insurance / auto payments
  [/geico/i, "Auto Insurance"],
  [/bridgecrest/i, "Car Payment"],
  [/afterpay/i, "Loan Payment"],

  // Other groceries / food
  [/publix|kroger/i, "Groceries"],
  [/chick.fil|whataburger|pizza hut|dunkin/i, "Restaurants"],

  // Transport
  [/marta breeze/i, "Transport"],
];

/** Patterns applied only when the transaction is income (positive cash inflow). */
const INCOME_PATTERNS: [RegExp, string][] = [
  [/\bpayroll\b|direct dep|paycheck|navusoft/i, "Paycheck"],
  [/^deposit\s+deposit$/i, "Paycheck"], // Navy Federal renders Navusoft's second deposit as a bare "Deposit"
  [/capital one bank/i, "Owner's Draw"], // Meridian draw — closed Oct 2026, kept so history stays right
  [/simon jones|frank merz|april graybill/i, "Income"], // rent share and April's contribution
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

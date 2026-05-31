/**
 * Pure types + constants for the strategic bucket classification.
 * Lives outside `src/lib/actions/budget.ts` because client components need
 * these values, and that file imports DB code (db, schema) which can't run
 * in a client bundle.
 *
 * The bucket-name → category-name map (CATEGORY_BUCKETS) stays in
 * actions/budget.ts since the suggestion engine + strategy code there is
 * tightly coupled to it. This file is the public, client-safe surface.
 */

export type AllocationBucketKey = "committed" | "essential" | "operational" | "discretionary";

export const BUCKET_DISPLAY_ORDER: AllocationBucketKey[] = [
  "committed",
  "essential",
  "operational",
  "discretionary",
];

export const BUCKET_LABELS: Record<AllocationBucketKey, { label: string; sublabel: string; color: string }> = {
  committed: { label: "Committed", sublabel: "rent · debt · utilities", color: "#475569" },
  essential: { label: "Essential", sublabel: "groceries · health · gas", color: "#0d9488" },
  operational: { label: "Operational", sublabel: "subs · services", color: "#2563eb" },
  discretionary: { label: "Discretionary", sublabel: "food out · shopping · fun", color: "#dc2626" },
};

// Subset of category names → bucket. Mirrors CATEGORY_BUCKETS in
// actions/budget.ts. Kept in sync manually — small enough that drift is
// unlikely; if it grows, derive both from a single source.
const BUCKET_BY_CATEGORY_NAME: Record<string, AllocationBucketKey> = {
  // Committed
  "Housing": "committed",
  "Auto Insurance": "committed",
  "Insurance": "committed",
  "Renters Insurance": "committed",
  "Bills & Utilities": "committed",
  "Utilities": "committed",
  "Internet": "committed",
  "Phone": "committed",
  "Home & Garden": "committed",
  "Debt Payment": "committed",
  "Loan Payment": "committed",
  "Car Payment": "committed",
  "Late Fees & Interest": "committed",
  "Taxes": "committed",
  "Savings": "committed",
  "Investing": "committed",
  "Crypto": "committed",
  "Legal Services": "committed",

  // Essential
  "Groceries": "essential",
  "Health": "essential",
  "Pharmacy": "essential",
  "Personal Care": "essential",
  "Gas & Fuel": "essential",
  "Transport": "essential",
  "Car Care": "essential",

  // Operational
  "Subscriptions": "operational",
  "Streaming": "operational",
  "AI Tools": "operational",
  "Cloud Storage": "operational",
  "SaaS & Dev Tools": "operational",
  "News & Media": "operational",
  "Web Hosting": "operational",
  "Gaming": "operational",

  // Discretionary
  "Restaurants": "discretionary",
  "Dining": "discretionary",
  "Fast Food": "discretionary",
  "Coffee & Cafes": "discretionary",
  "Entertainment": "discretionary",
  "Shopping": "discretionary",
  "Clothing & Fashion": "discretionary",
  "Books & Education": "discretionary",
  "Stationery & Gifts": "discretionary",
  "Vape & Tobacco": "discretionary",
  "Adult Content": "discretionary",
  "Peer-to-Peer": "discretionary",
  "Other": "discretionary",
};

export function getBucketForCategoryName(name: string | null | undefined): AllocationBucketKey | null {
  if (!name) return null;
  return BUCKET_BY_CATEGORY_NAME[name] ?? null;
}

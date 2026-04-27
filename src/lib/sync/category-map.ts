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
 * Given a Teller category string (or null), return the matching Bud category ID.
 */
export function mapTellerCategory(tellerCategory: string | null): string | null {
  if (!tellerCategory) return getCategoryId("Other");

  const budName = TELLER_TO_BUD[tellerCategory.toLowerCase()];
  if (!budName) return getCategoryId("Other");

  return getCategoryId(budName);
}

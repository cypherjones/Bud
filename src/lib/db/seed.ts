import { db } from "./index";
import { categories } from "./schema";
import { newId } from "../utils/ids";
import { now } from "../utils/format";
import { eq } from "drizzle-orm";

const DEFAULT_CATEGORIES = [
  { name: "Groceries", icon: "🛒", color: "#7C3AED" },
  { name: "Dining", icon: "🍽️", color: "#F59E0B" },
  { name: "Transport", icon: "🚗", color: "#3B82F6" },
  { name: "Entertainment", icon: "🎬", color: "#EC4899" },
  { name: "Bills & Utilities", icon: "💡", color: "#10B981" },
  { name: "Shopping", icon: "🛍️", color: "#8B5CF6" },
  { name: "Health", icon: "🏥", color: "#EF4444" },
  { name: "Housing", icon: "🏠", color: "#6366F1" },
  { name: "Income", icon: "💰", color: "#22C55E" },
  { name: "Taxes", icon: "🏛️", color: "#DC2626" },
  { name: "Debt Payment", icon: "💳", color: "#F97316" },
  { name: "Savings", icon: "🏦", color: "#14B8A6" },
  { name: "Subscriptions", icon: "🔄", color: "#A855F7" },
  { name: "Personal Care", icon: "✂️", color: "#F472B6" },
  { name: "Other", icon: "📦", color: "#6B7280" },
];

export async function seed() {
  const existing = db.select().from(categories).all();
  if (existing.length > 0) return; // already seeded

  const timestamp = now();
  for (const cat of DEFAULT_CATEGORIES) {
    db.insert(categories)
      .values({
        id: newId(),
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
        isSystem: true,
        createdAt: timestamp,
      })
      .run();
  }
  console.log(`Seeded ${DEFAULT_CATEGORIES.length} categories`);
}

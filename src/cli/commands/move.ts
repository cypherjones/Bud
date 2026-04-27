import { db, schema } from "../../lib/db/index.js";
import { eq } from "drizzle-orm";
import { header, section, progressBar, formatCents, bold, dim, green, red } from "../helpers.js";

export function moveCommand() {
  const plan = db.select().from(schema.financialPlans).where(eq(schema.financialPlans.type, "move")).limit(1).get();

  header("Houston Move Plan");

  if (!plan) {
    console.log(dim("  No move plan created yet. Ask Bud: \"Let's plan my Houston move\""));
    console.log();
    return;
  }

  const items = db.select().from(schema.planLineItems).where(eq(schema.planLineItems.planId, plan.id)).all();
  const totalEstimated = items.reduce((s, i) => s + (i.estimatedAmount ?? 0), 0);
  const target = plan.targetAmount ?? totalEstimated;
  const paidItems = items.filter((i) => i.isPaid);
  const paidTotal = paidItems.reduce((s, i) => s + (i.actualAmount ?? i.estimatedAmount ?? 0), 0);

  const daysUntil = plan.targetDate
    ? Math.ceil((new Date(plan.targetDate).getTime() - Date.now()) / 86400000)
    : null;

  // Summary
  console.log(`  Plan:      ${bold(plan.name)} (${plan.status})`);
  if (plan.targetDate) {
    console.log(`  Target:    ${plan.targetDate}${daysUntil !== null ? ` (${daysUntil > 0 ? `${daysUntil} days` : red("PAST DUE")})` : ""}`);
  }
  console.log(`  Saved:     ${bold(formatCents(plan.currentSaved))} / ${formatCents(target)}`);
  console.log(`  Progress:  ${progressBar(plan.currentSaved, target)}`);
  console.log(`  Items:     ${paidItems.length}/${items.length} covered (${formatCents(paidTotal)} spent)`);
  console.log();

  // Group by category
  const categories = [...new Set(items.map((i) => i.category))];
  for (const cat of categories) {
    const catItems = items.filter((i) => i.category === cat);
    const catTotal = catItems.reduce((s, i) => s + (i.estimatedAmount ?? 0), 0);

    section(`${cat.toUpperCase().replace("_", " ")} — ${formatCents(catTotal)}`);
    for (const item of catItems) {
      const check = item.isPaid ? green("✓") : dim("○");
      const amount = formatCents(item.estimatedAmount ?? 0);
      const actual = item.isPaid && item.actualAmount ? ` (actual: ${formatCents(item.actualAmount)})` : "";
      const req = item.isRequired ? "" : dim(" [optional]");
      console.log(`    ${check} ${item.name}: ${amount}${actual}${req}`);
    }
    console.log();
  }
}

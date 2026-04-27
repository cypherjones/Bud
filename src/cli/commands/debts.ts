import { db, schema } from "../../lib/db/index.js";
import { eq } from "drizzle-orm";
import { calculateDebtAllocation } from "../../lib/utils/debt-engine.js";
import { header, section, progressBar, formatCents, bold, dim, purple, amber, green, red } from "../helpers.js";
import Table from "cli-table3";

export function debtsCommand() {
  const debts = db.select().from(schema.debts).where(eq(schema.debts.status, "active")).all();

  header("Debt Overview");

  if (debts.length === 0) {
    console.log(dim("  No active debts tracked. Tell Bud about your debts to get started."));
    console.log();
    return;
  }

  const totalDebt = debts.reduce((s, d) => s + d.currentBalance, 0);
  const totalOriginal = debts.reduce((s, d) => s + d.originalBalance, 0);
  const totalMinimums = debts.reduce((s, d) => s + d.minimumPayment, 0);

  console.log(`  Total:     ${bold(formatCents(totalDebt))} remaining`);
  console.log(`  Minimums:  ${formatCents(totalMinimums)}/mo`);
  console.log(`  Progress:  ${progressBar(totalOriginal - totalDebt, totalOriginal)}`);
  console.log();

  // Debt table
  const table = new Table({
    head: ["Creditor", "Balance", "Rate", "Min/mo", "Utilization", "Progress"],
    style: { head: ["magenta"] },
  });

  for (const d of debts) {
    const pct = d.originalBalance > 0
      ? Math.round(((d.originalBalance - d.currentBalance) / d.originalBalance) * 100)
      : 0;
    const util = d.creditLimit
      ? `${Math.round((d.currentBalance / d.creditLimit) * 100)}%`
      : "—";

    table.push([
      d.creditorName,
      formatCents(d.currentBalance),
      `${(d.interestRate * 100).toFixed(1)}%`,
      formatCents(d.minimumPayment),
      util,
      `${pct}%`,
    ]);
  }

  console.log(table.toString());
  console.log();

  // Smart allocation
  const movePlan = db.select().from(schema.financialPlans).where(eq(schema.financialPlans.type, "move")).get();
  const allocation = calculateDebtAllocation(
    debts,
    totalMinimums,
    movePlan ? { targetAmount: movePlan.targetAmount, currentSaved: movePlan.currentSaved, targetDate: movePlan.targetDate } : undefined
  );

  section("SMART ALLOCATION");
  console.log(dim(`  Budget: ${allocation.total_budget} | Minimums: ${allocation.total_minimums} | Surplus: ${allocation.surplus}`));
  console.log();

  for (const a of allocation.allocations) {
    console.log(`  ${bold(a.creditor)}: ${purple(a.payment)} ${dim(`(${a.breakdown})`)}`);
    console.log(`    ${dim(a.reasoning)}`);
  }

  if (allocation.projected_impact) {
    console.log();
    console.log(dim(`  ${allocation.projected_impact}`));
  }
  console.log();
}

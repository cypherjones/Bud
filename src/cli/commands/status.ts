import { db, schema } from "../../lib/db/index.js";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { header, section, progressBar, formatCents, bold, dim, purple, amber, green, red } from "../helpers.js";

export function statusCommand() {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const today = now.toISOString().split("T")[0];

  header("Financial Snapshot", today);

  // Monthly spending & income
  const spending = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)` })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.type, "expense"), gte(schema.transactions.date, monthStart)))
    .get();

  const income = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)` })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.type, "income"), gte(schema.transactions.date, monthStart)))
    .get();

  const spendAmt = spending?.total ?? 0;
  const incomeAmt = income?.total ?? 0;

  section("THIS MONTH");
  console.log(`  Income:    ${green(formatCents(incomeAmt))}`);
  console.log(`  Spent:     ${red(formatCents(spendAmt))}`);
  console.log(`  Net:       ${incomeAmt - spendAmt >= 0 ? green(formatCents(incomeAmt - spendAmt)) : red(formatCents(incomeAmt - spendAmt))}`);
  console.log();

  // Debts
  const debts = db.select().from(schema.debts).where(eq(schema.debts.status, "active")).all();
  if (debts.length > 0) {
    const totalDebt = debts.reduce((s, d) => s + d.currentBalance, 0);
    const totalOriginal = debts.reduce((s, d) => s + d.originalBalance, 0);
    section("DEBTS");
    console.log(`  Total:     ${bold(formatCents(totalDebt))} remaining`);
    console.log(`  Progress:  ${progressBar(totalOriginal - totalDebt, totalOriginal)}`);
    for (const d of debts) {
      const pct = d.originalBalance > 0 ? Math.round(((d.originalBalance - d.currentBalance) / d.originalBalance) * 100) : 0;
      console.log(`  ${dim("·")} ${d.creditorName}: ${formatCents(d.currentBalance)} ${dim(`(${(d.interestRate * 100).toFixed(1)}% APR)`)}`);
    }
    console.log();
  }

  // Taxes
  const taxes = db.select().from(schema.taxObligations).where(eq(schema.taxObligations.status, "active")).all();
  if (taxes.length > 0) {
    const totalTax = taxes.reduce((s, t) => s + t.remainingBalance, 0);
    section("TAXES");
    console.log(`  Total owed: ${bold(formatCents(totalTax))}`);
    for (const t of taxes) {
      const due = t.dueDate ? dim(` due ${t.dueDate}`) : "";
      console.log(`  ${dim("·")} ${t.agency} (${t.taxYear}): ${formatCents(t.remainingBalance)}${due}`);
    }
    console.log();
  }

  // Credit
  const latestScore = db.select().from(schema.creditScores).orderBy(desc(schema.creditScores.date)).limit(1).get();
  if (latestScore) {
    const prev = db.select().from(schema.creditScores).orderBy(desc(schema.creditScores.date)).limit(1).offset(1).get();
    const change = prev ? latestScore.score - prev.score : 0;
    const tier = latestScore.score >= 740 ? "Very Good" : latestScore.score >= 670 ? "Good" : latestScore.score >= 580 ? "Fair" : "Poor";

    section("CREDIT");
    const changeStr = change > 0 ? green(`+${change}`) : change < 0 ? red(`${change}`) : dim("±0");
    console.log(`  Score:     ${bold(String(latestScore.score))} (${tier}) ${changeStr} pts`);

    const factors = db.select().from(schema.creditFactors).where(eq(schema.creditFactors.scoreId, latestScore.id)).get();
    if (factors?.utilizationRatio !== null && factors?.utilizationRatio !== undefined) {
      const util = Math.round(factors.utilizationRatio * 100);
      console.log(`  Util:      ${util > 30 ? amber(`${util}%`) : green(`${util}%`)}${util > 30 ? dim(" — target: <30%") : ""}`);
    }
    console.log();
  }

  // Move plan
  const movePlan = db.select().from(schema.financialPlans).where(eq(schema.financialPlans.type, "move")).limit(1).get();
  if (movePlan) {
    const target = movePlan.targetAmount ?? 0;
    const saved = movePlan.currentSaved;
    const daysUntil = movePlan.targetDate
      ? Math.ceil((new Date(movePlan.targetDate).getTime() - now.getTime()) / 86400000)
      : null;

    section("HOUSTON MOVE");
    console.log(`  Saved:     ${bold(formatCents(saved))} / ${formatCents(target)}`);
    console.log(`  Progress:  ${progressBar(saved, target)}`);
    if (daysUntil !== null) {
      console.log(`  Timeline:  ${daysUntil > 0 ? `${daysUntil} days to go` : red("Past target date")}`);
    }
    console.log();
  }

  // If nothing tracked yet
  if (debts.length === 0 && taxes.length === 0 && !latestScore && !movePlan && spendAmt === 0) {
    console.log(dim("  Nothing tracked yet. Run `bud chat` to tell Bud about your finances."));
    console.log();
  }
}

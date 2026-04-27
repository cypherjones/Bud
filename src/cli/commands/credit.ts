import { db, schema } from "../../lib/db/index.js";
import { desc, eq } from "drizzle-orm";
import { header, section, bold, dim, green, red, amber } from "../helpers.js";

export function creditCommand() {
  const scores = db.select().from(schema.creditScores).orderBy(desc(schema.creditScores.date)).limit(12).all();

  header("Credit Score");

  if (scores.length === 0) {
    console.log(dim("  No credit scores logged. Tell Bud your current score to start tracking."));
    console.log();
    return;
  }

  const latest = scores[0];
  const prev = scores.length > 1 ? scores[1] : null;
  const change = prev ? latest.score - prev.score : 0;
  const tier = latest.score >= 800 ? "Excellent" : latest.score >= 740 ? "Very Good" : latest.score >= 670 ? "Good" : latest.score >= 580 ? "Fair" : "Poor";

  const tierColor = tier === "Excellent" || tier === "Very Good" ? green : tier === "Good" ? amber : red;
  const changeStr = change > 0 ? green(`+${change}`) : change < 0 ? red(`${change}`) : dim("±0");

  console.log(`  Score:   ${bold(String(latest.score))} ${tierColor(`(${tier})`)} ${changeStr} pts`);
  console.log(`  Date:    ${latest.date}${latest.source ? dim(` via ${latest.source}`) : ""}`);

  // Factors
  const factors = db.select().from(schema.creditFactors).where(eq(schema.creditFactors.scoreId, latest.id)).get();
  if (factors) {
    console.log();
    section("FACTORS");
    if (factors.utilizationRatio !== null) {
      const util = Math.round(factors.utilizationRatio * 100);
      console.log(`  Utilization:      ${util > 30 ? amber(`${util}%`) : green(`${util}%`)}${util > 30 ? dim(" — target: <30%") : green(" ✓")}`);
    }
    if (factors.onTimePayments !== null) {
      console.log(`  On-time streak:   ${green(`${factors.onTimePayments} months`)}`);
    }
    if (factors.hardInquiries !== null) {
      console.log(`  Hard inquiries:   ${factors.hardInquiries} ${dim("(last 2 years)")}`);
    }
    if (factors.totalBalance !== null && factors.totalCreditLimit !== null) {
      console.log(`  Total balance:    $${(factors.totalBalance / 100).toLocaleString()} / $${(factors.totalCreditLimit / 100).toLocaleString()}`);
    }
  }

  // Sparkline (simple ASCII)
  if (scores.length > 1) {
    console.log();
    section("TREND");
    const reversed = [...scores].reverse();
    const min = Math.min(...reversed.map((s) => s.score));
    const max = Math.max(...reversed.map((s) => s.score));
    const range = max - min || 1;

    const chars = "▁▂▃▄▅▆▇█";
    const sparkline = reversed.map((s) => {
      const idx = Math.round(((s.score - min) / range) * (chars.length - 1));
      return chars[idx];
    }).join("");

    console.log(`  ${dim(String(min))} ${sparkline} ${dim(String(max))}`);
    console.log(`  ${dim(reversed[0].date)}${dim(" ".repeat(Math.max(1, sparkline.length - 10)))}${dim(reversed[reversed.length - 1].date)}`);
  }

  console.log();
}

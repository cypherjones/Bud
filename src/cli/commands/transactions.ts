import { db, schema } from "../../lib/db/index.js";
import { desc, eq } from "drizzle-orm";
import { header, dim, bold, green, red } from "../helpers.js";
import Table from "cli-table3";

export function transactionsCommand(opts: { limit?: string }) {
  const limit = parseInt(opts.limit ?? "15", 10);

  header("Recent Transactions");

  const txs = db
    .select({
      date: schema.transactions.date,
      merchant: schema.transactions.merchant,
      description: schema.transactions.description,
      amount: schema.transactions.amount,
      type: schema.transactions.type,
      status: schema.transactions.status,
      categoryName: schema.categories.name,
    })
    .from(schema.transactions)
    .leftJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
    .orderBy(desc(schema.transactions.date))
    .limit(limit)
    .all();

  if (txs.length === 0) {
    console.log(dim("  No transactions yet. Sync your bank to see transactions."));
    console.log();
    return;
  }

  const table = new Table({
    head: ["Date", "Merchant", "Amount", "Category", "Status"],
    style: { head: ["magenta"] },
  });

  for (const tx of txs) {
    const amount = (tx.amount / 100).toFixed(2);
    const formatted = tx.type === "income"
      ? green(`+$${amount}`)
      : red(`-$${amount}`);

    table.push([
      tx.date,
      tx.merchant ?? tx.description,
      formatted,
      tx.categoryName ?? "—",
      tx.status,
    ]);
  }

  console.log(table.toString());
  console.log(dim(`  Showing ${txs.length} most recent transactions`));
  console.log();
}

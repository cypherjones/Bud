import { db, schema } from "../../lib/db/index.js";
import { syncSimplefinConnection } from "../../lib/sync/simplefin.js";
import { decrypt } from "../../lib/utils/crypto.js";
import { header, bold, dim, green, red } from "../helpers.js";

export async function syncCommand() {
  header("Bank Sync");

  const connections = db.select().from(schema.simplefinConnections).all();

  if (connections.length === 0) {
    console.log(red("  No bank connections configured."));
    console.log(dim("  Go to Settings in the web app to connect SimpleFIN."));
    console.log();
    return;
  }

  for (const connection of connections) {
    console.log(bold(`  ${connection.name}`));

    let accessUrl: string;
    try {
      accessUrl = decrypt(connection.accessUrl);
    } catch {
      console.log(red("  Failed to decrypt access URL"));
      continue;
    }

    try {
      process.stdout.write(dim("    Syncing accounts + transactions... "));
      const result = await syncSimplefinConnection(accessUrl, connection.id);
      const placeholderNote = result.resolvedPlaceholders > 0 ? `, ${result.resolvedPlaceholders} placeholder${result.resolvedPlaceholders === 1 ? "" : "s"} resolved` : "";
      console.log(green(`${result.newAccounts} new accounts, ${result.newTransactions} new txns, ${result.updatedTransactions} updated${placeholderNote}`));
    } catch (err) {
      console.log(red("failed"));
      console.error(`    Error: ${err instanceof Error ? err.message : err}`);
    }
    console.log();
  }

  console.log(bold("  Sync complete."));
  console.log();
}

import { db, schema } from "../../lib/db/index.js";
import { syncAccounts, syncTransactions } from "../../lib/sync/teller.js";
import { decrypt } from "../../lib/utils/crypto.js";
import { header, bold, dim, green, red } from "../helpers.js";

export async function syncCommand() {
  header("Bank Sync");

  const enrollments = db.select().from(schema.tellerEnrollments).all();

  if (enrollments.length === 0) {
    console.log(red("  No bank connections configured."));
    console.log(dim("  Go to Settings in the web app to connect your bank."));
    console.log();
    return;
  }

  for (const enrollment of enrollments) {
    console.log(bold(`  ${enrollment.institution}`));

    let accessToken: string;
    try {
      accessToken = decrypt(enrollment.accessToken);
    } catch {
      console.log(red("  Failed to decrypt token"));
      continue;
    }

    try {
      process.stdout.write(dim("    Syncing accounts... "));
      const newAccounts = await syncAccounts(accessToken, enrollment.enrollmentId);
      console.log(green(`${newAccounts} new`));

      process.stdout.write(dim("    Syncing transactions... "));
      const result = await syncTransactions(accessToken, enrollment.enrollmentId);
      const placeholderNote = result.resolvedPlaceholders > 0 ? `, ${result.resolvedPlaceholders} placeholder${result.resolvedPlaceholders === 1 ? "" : "s"} resolved` : "";
      console.log(green(`${result.newTransactions} new, ${result.updatedTransactions} updated${placeholderNote}`));
    } catch (err) {
      console.log(red("failed"));
      console.error(`    Error: ${err instanceof Error ? err.message : err}`);
    }
    console.log();
  }

  console.log(bold("  Sync complete."));
  console.log();
}

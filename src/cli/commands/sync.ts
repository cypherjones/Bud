import { db, schema } from "../../lib/db/index.js";
import { eq } from "drizzle-orm";
import { syncAccounts, syncTransactions } from "../../lib/sync/teller.js";
import { header, bold, dim, green, red } from "../helpers.js";

export async function syncCommand() {
  header("Bank Sync");

  const tokenSetting = db.select().from(schema.settings).where(eq(schema.settings.key, "teller_access_token")).get();

  if (!tokenSetting) {
    console.log(red("  No Teller access token configured."));
    console.log(dim("  Go to Settings in the web app to connect your bank."));
    console.log();
    return;
  }

  const accessToken = JSON.parse(tokenSetting.value) as string;
  const enrollmentSetting = db.select().from(schema.settings).where(eq(schema.settings.key, "teller_enrollment_id")).get();
  const enrollmentId = enrollmentSetting ? JSON.parse(enrollmentSetting.value) as string : "";

  try {
    process.stdout.write(dim("  Syncing accounts... "));
    const newAccounts = await syncAccounts(accessToken, enrollmentId);
    console.log(green(`${newAccounts} new`));

    process.stdout.write(dim("  Syncing transactions... "));
    const result = await syncTransactions(accessToken);
    console.log(green(`${result.newTransactions} new, ${result.updatedTransactions} updated`));

    console.log();
    console.log(bold("  Sync complete."));
  } catch (err) {
    console.log(red("failed"));
    console.error(`  Error: ${err instanceof Error ? err.message : err}`);
  }
  console.log();
}

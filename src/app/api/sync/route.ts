import { syncAccounts, syncTransactions } from "@/lib/sync/teller";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // Get Teller access token from settings
  const tokenSetting = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "teller_access_token"))
    .get();

  if (!tokenSetting) {
    return Response.json(
      { error: "No Teller access token configured. Connect your bank first." },
      { status: 400 }
    );
  }

  const accessToken = JSON.parse(tokenSetting.value) as string;

  try {
    // Sync accounts first
    const enrollmentSetting = db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "teller_enrollment_id"))
      .get();

    const enrollmentId = enrollmentSetting
      ? (JSON.parse(enrollmentSetting.value) as string)
      : "";

    const newAccounts = await syncAccounts(accessToken, enrollmentId);

    // Then sync transactions
    const { newTransactions, updatedTransactions } = await syncTransactions(accessToken);

    return Response.json({
      success: true,
      new_accounts: newAccounts,
      new_transactions: newTransactions,
      updated_transactions: updatedTransactions,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Sync failed";
    console.error("Sync error:", error);
    return Response.json({ error: message }, { status: 500 });
  }
}

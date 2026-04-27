import { syncAccounts, syncTransactions } from "@/lib/sync/teller";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { decrypt } from "@/lib/utils/crypto";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();

  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  // Get encrypted Teller access token from settings
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

  let accessToken: string;
  try {
    accessToken = decrypt(tokenSetting.value);
  } catch {
    // Handle legacy unencrypted values (pre-migration)
    try {
      accessToken = JSON.parse(tokenSetting.value) as string;
    } catch {
      return Response.json({ error: "Failed to decrypt access token" }, { status: 500 });
    }
  }

  try {
    // Get enrollment ID
    const enrollmentSetting = db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "teller_enrollment_id"))
      .get();

    let enrollmentId = "";
    if (enrollmentSetting) {
      try {
        enrollmentId = decrypt(enrollmentSetting.value);
      } catch {
        try {
          enrollmentId = JSON.parse(enrollmentSetting.value) as string;
        } catch {
          enrollmentId = "";
        }
      }
    }

    const newAccounts = await syncAccounts(accessToken, enrollmentId);
    const { newTransactions, updatedTransactions } = await syncTransactions(accessToken);

    return Response.json({
      success: true,
      new_accounts: newAccounts,
      new_transactions: newTransactions,
      updated_transactions: updatedTransactions,
    });
  } catch (error: unknown) {
    console.error("Sync error:", error);
    return Response.json({ error: "Sync failed" }, { status: 500 });
  }
}

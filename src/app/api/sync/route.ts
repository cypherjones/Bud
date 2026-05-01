import { syncAccounts, syncTransactions } from "@/lib/sync/teller";
import { db, schema } from "@/lib/db";
import { decrypt } from "@/lib/utils/crypto";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();

  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const enrollments = db.select().from(schema.tellerEnrollments).all();

  if (enrollments.length === 0) {
    return Response.json(
      { error: "No bank connections configured. Connect a bank first." },
      { status: 400 }
    );
  }

  let totalNewAccounts = 0;
  let totalNewTransactions = 0;
  let totalUpdatedTransactions = 0;
  let totalResolvedPlaceholders = 0;
  const errors: string[] = [];

  for (const enrollment of enrollments) {
    let accessToken: string;
    try {
      accessToken = decrypt(enrollment.accessToken);
    } catch {
      errors.push(`Failed to decrypt token for ${enrollment.institution}`);
      continue;
    }

    try {
      const newAccounts = await syncAccounts(accessToken, enrollment.enrollmentId);
      const { newTransactions, updatedTransactions, resolvedPlaceholders } = await syncTransactions(accessToken, enrollment.enrollmentId);

      totalNewAccounts += newAccounts;
      totalNewTransactions += newTransactions;
      totalUpdatedTransactions += updatedTransactions;
      totalResolvedPlaceholders += resolvedPlaceholders;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`Sync error for ${enrollment.institution}:`, error);
      errors.push(`${enrollment.institution}: ${message}`);
    }
  }

  return Response.json({
    success: errors.length === 0,
    new_accounts: totalNewAccounts,
    new_transactions: totalNewTransactions,
    updated_transactions: totalUpdatedTransactions,
    resolved_placeholders: totalResolvedPlaceholders,
    errors: errors.length > 0 ? errors : undefined,
  });
}

import { syncSimplefinConnection } from "@/lib/sync/simplefin";
import { db, schema } from "@/lib/db";
import { decrypt } from "@/lib/utils/crypto";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { rollRecurringForward } from "@/lib/actions/recurring";
import { logSeenDebtPayments } from "@/lib/debts/seen-payments";
import { bankSyncAllowed, SYNC_REFUSED_MESSAGE } from "@/app/settings/sync-guard";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();

  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  // The droplet is the source of truth; never sync banks from a dev machine.
  if (!bankSyncAllowed()) return Response.json({ error: SYNC_REFUSED_MESSAGE }, { status: 409 });

  const connections = db.select().from(schema.simplefinConnections).all();

  if (connections.length === 0) {
    return Response.json(
      { error: "No bank connections configured. Connect SimpleFIN in Settings first." },
      { status: 400 }
    );
  }

  let totalNewAccounts = 0;
  let totalNewTransactions = 0;
  let totalUpdatedTransactions = 0;
  let totalResolvedPlaceholders = 0;
  const errors: string[] = [];

  for (const connection of connections) {
    let accessUrl: string;
    try {
      accessUrl = decrypt(connection.accessUrl);
    } catch {
      errors.push(`Failed to decrypt access URL for ${connection.name}`);
      continue;
    }

    try {
      const result = await syncSimplefinConnection(accessUrl, connection.id);
      totalNewAccounts += result.newAccounts;
      totalNewTransactions += result.newTransactions;
      totalUpdatedTransactions += result.updatedTransactions;
      totalResolvedPlaceholders += result.resolvedPlaceholders;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`Sync error for ${connection.name}:`, error);
      errors.push(`${connection.name}: ${message}`);
    }
  }

  // New rows may have landed; move the schedule's dates and last-seen marks along.
  rollRecurringForward();
  logSeenDebtPayments();

  return Response.json({
    success: errors.length === 0,
    new_accounts: totalNewAccounts,
    new_transactions: totalNewTransactions,
    updated_transactions: totalUpdatedTransactions,
    resolved_placeholders: totalResolvedPlaceholders,
    errors: errors.length > 0 ? errors : undefined,
  });
}

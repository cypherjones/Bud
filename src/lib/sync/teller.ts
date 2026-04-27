import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { newId } from "@/lib/utils/ids";
import { now } from "@/lib/utils/format";
import { mapTellerCategory } from "./category-map";
import { Agent } from "undici";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const TELLER_API_BASE = "https://api.teller.io";

const CERT_DIR = join(process.cwd(), "teller-certs");

let _tlsAgent: Agent | undefined;
function getTlsAgent(): Agent {
  if (!_tlsAgent) {
    _tlsAgent = new Agent({
      connect: {
        cert: readFileSync(join(CERT_DIR, "certificate.pem")),
        key: readFileSync(join(CERT_DIR, "private_key.pem")),
      },
    });
  }
  return _tlsAgent;
}

type TellerTransaction = {
  id: string;
  account_id: string;
  amount: string; // signed string
  date: string;
  description: string;
  status: "posted" | "pending";
  type: string;
  details: {
    processing_status: string;
    category: string | null;
    counterparty: {
      name: string | null;
      type: string | null;
    };
  };
};

type TellerAccount = {
  id: string;
  enrollment_id: string;
  name: string;
  type: "depository" | "credit";
  subtype: string;
  currency: string;
  last_four: string;
  status: string;
  institution: { id: string; name: string };
};

function getAuthHeader(accessToken: string): HeadersInit {
  const encoded = Buffer.from(`${accessToken}:`).toString("base64");
  return {
    Authorization: `Basic ${encoded}`,
    "Content-Type": "application/json",
  };
}

/**
 * Fetch all accounts for an enrollment
 */
export async function fetchTellerAccounts(accessToken: string): Promise<TellerAccount[]> {
  const res = await fetch(`${TELLER_API_BASE}/accounts`, {
    headers: getAuthHeader(accessToken),
    // @ts-expect-error -- dispatcher is a valid undici option for Node's built-in fetch
    dispatcher: getTlsAgent(),
  });

  if (!res.ok) {
    throw new Error(`Teller accounts fetch failed: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

/**
 * Fetch transactions for an account, with optional date range
 */
export async function fetchTellerTransactions(
  accessToken: string,
  accountId: string,
  opts?: { count?: number; fromId?: string; startDate?: string; endDate?: string }
): Promise<TellerTransaction[]> {
  const params = new URLSearchParams();
  if (opts?.count) params.set("count", String(opts.count));
  if (opts?.fromId) params.set("from_id", opts.fromId);
  if (opts?.startDate) params.set("start_date", opts.startDate);
  if (opts?.endDate) params.set("end_date", opts.endDate);

  const url = `${TELLER_API_BASE}/accounts/${accountId}/transactions${params.toString() ? `?${params}` : ""}`;
  const res = await fetch(url, {
    headers: getAuthHeader(accessToken),
    // @ts-expect-error -- dispatcher is a valid undici option for Node's built-in fetch
    dispatcher: getTlsAgent(),
  });

  if (!res.ok) {
    throw new Error(`Teller transactions fetch failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Sync accounts from Teller into the local database
 */
export async function syncAccounts(accessToken: string, enrollmentId: string): Promise<number> {
  const tellerAccounts = await fetchTellerAccounts(accessToken);
  let synced = 0;

  for (const ta of tellerAccounts) {
    const existing = db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.tellerAccountId, ta.id))
      .get();

    if (existing) {
      db.update(schema.accounts)
        .set({ name: ta.name, lastSynced: now() })
        .where(eq(schema.accounts.id, existing.id))
        .run();
    } else {
      db.insert(schema.accounts)
        .values({
          id: newId(),
          name: ta.name,
          institution: ta.institution.name,
          accountType: ta.type,
          subtype: ta.subtype,
          lastFour: ta.last_four,
          currency: ta.currency,
          tellerAccountId: ta.id,
          tellerEnrollmentId: enrollmentId,
          lastSynced: now(),
          createdAt: now(),
        })
        .run();
      synced++;
    }
  }

  return synced;
}

/**
 * Sync transactions for all connected accounts.
 * Uses 10-day overlap window to catch pending→posted transitions.
 * Deduplicates by Teller transaction ID.
 */
export async function syncTransactions(accessToken: string): Promise<{
  newTransactions: number;
  updatedTransactions: number;
}> {
  // Get all accounts with a Teller account ID (single-user app)
  const allAccounts = db
    .select()
    .from(schema.accounts)
    .all();

  let newCount = 0;
  let updatedCount = 0;

  for (const account of allAccounts) {
    if (!account.tellerAccountId) continue;

    // Fetch with 10-day overlap from last sync
    const lastSync = account.lastSynced;
    let startDate: string | undefined;
    if (lastSync) {
      const d = new Date(lastSync);
      d.setDate(d.getDate() - 10);
      startDate = d.toISOString().split("T")[0];
    }

    const transactions = await fetchTellerTransactions(accessToken, account.tellerAccountId, {
      count: 250,
      startDate,
    });

    for (const tx of transactions) {
      const existing = db
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.bankTransactionId, tx.id))
        .get();

      // Parse amount: Teller gives signed string, negative = money out
      const amountCents = Math.round(Math.abs(parseFloat(tx.amount)) * 100);
      const isExpense = parseFloat(tx.amount) < 0;

      // Map Teller category to Bud category
      const categoryId = mapTellerCategory(tx.details.category);

      if (existing) {
        // Update if status changed (pending -> posted)
        if (existing.status !== tx.status) {
          db.update(schema.transactions)
            .set({ status: tx.status, amount: amountCents, date: tx.date })
            .where(eq(schema.transactions.id, existing.id))
            .run();
          updatedCount++;
        }
      } else {
        db.insert(schema.transactions)
          .values({
            id: newId(),
            accountId: account.id,
            amount: amountCents,
            type: isExpense ? "expense" : "income",
            description: tx.description,
            merchant: tx.details.counterparty?.name ?? tx.description,
            categoryId,
            date: tx.date,
            status: tx.status,
            bankTransactionId: tx.id,
            isRecurring: false,
            createdAt: now(),
          })
          .run();
        newCount++;
      }
    }

    // Update last synced
    db.update(schema.accounts)
      .set({ lastSynced: now() })
      .where(eq(schema.accounts.id, account.id))
      .run();
  }

  return { newTransactions: newCount, updatedTransactions: updatedCount };
}

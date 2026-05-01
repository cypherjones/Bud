import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { newId } from "@/lib/utils/ids";
import { now } from "@/lib/utils/format";
import { mapTellerCategory } from "./category-map";
import { Agent, fetch as undiciFetch } from "undici";
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

/** Fetch with mTLS client certificate */
function tellerFetch(url: string, headers: HeadersInit) {
  return undiciFetch(url, {
    headers,
    dispatcher: getTlsAgent(),
  });
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
  const res = await tellerFetch(`${TELLER_API_BASE}/accounts`, getAuthHeader(accessToken));

  if (!res.ok) {
    throw new Error(`Teller accounts fetch failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<TellerAccount[]>;
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
  const res = await tellerFetch(url, getAuthHeader(accessToken));

  if (!res.ok) {
    throw new Error(`Teller transactions fetch failed: ${res.status}`);
  }

  return res.json() as Promise<TellerTransaction[]>;
}

/** Fetch balance for a specific account */
async function fetchTellerBalance(accessToken: string, accountId: string): Promise<number | null> {
  try {
    const res = await tellerFetch(`${TELLER_API_BASE}/accounts/${accountId}/balances`, getAuthHeader(accessToken));
    if (!res.ok) return null;
    const data = await res.json() as { available?: string; ledger?: string };
    const balance = parseFloat(data.available ?? data.ledger ?? "0");
    return Math.round(balance * 100);
  } catch {
    return null;
  }
}

/**
 * Sync accounts from Teller into the local database
 */
export async function syncAccounts(accessToken: string, enrollmentId: string): Promise<number> {
  const tellerAccounts = await fetchTellerAccounts(accessToken);
  let synced = 0;

  for (const ta of tellerAccounts) {
    // Fetch balance
    const balance = await fetchTellerBalance(accessToken, ta.id);

    const existing = db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.tellerAccountId, ta.id))
      .get();

    if (existing) {
      db.update(schema.accounts)
        .set({ name: ta.name, balance, lastSynced: now() })
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
          balance,
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
 * Deduplicates by Teller transaction ID and resolves user-entered placeholders.
 */
export async function syncTransactions(accessToken: string, enrollmentId: string): Promise<{
  newTransactions: number;
  updatedTransactions: number;
  resolvedPlaceholders: number;
}> {
  // Only fetch transactions for accounts belonging to this enrollment
  const allAccounts = db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.tellerEnrollmentId, enrollmentId))
    .all();

  let newCount = 0;
  let updatedCount = 0;
  let resolvedPlaceholders = 0;

  for (const account of allAccounts) {
    if (!account.tellerAccountId) continue;
    if (account.name.startsWith("[EXCLUDED]")) continue;

    // On first sync, go back to Jan 1 of the current year.
    // On subsequent syncs, use 10-day overlap from last sync.
    const lastSync = account.lastSynced;
    let startDate: string;
    if (lastSync) {
      const d = new Date(lastSync);
      d.setDate(d.getDate() - 10);
      startDate = d.toISOString().split("T")[0];
    } else {
      startDate = `${new Date().getFullYear()}-01-01`;
    }

    const transactions = await fetchTellerTransactions(accessToken, account.tellerAccountId, {
      count: 500,
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

      // Map Teller category to Bud category (with merchant fallback)
      const merchantName = tx.details.counterparty?.name ?? tx.description;
      const categoryId = mapTellerCategory(tx.details.category, merchantName, tx.description, isExpense);

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
        const newTxnId = newId();
        db.insert(schema.transactions)
          .values({
            id: newTxnId,
            accountId: account.id,
            amount: amountCents,
            type: isExpense ? "expense" : "income",
            description: tx.description,
            merchant: tx.details.counterparty?.name ?? tx.description,
            categoryId,
            date: tx.date,
            status: tx.status,
            bankTransactionId: tx.id,
            source: "teller",
            isRecurring: false,
            createdAt: now(),
          })
          .run();
        newCount++;

        // Resolve placeholder: a user-entered row on the same account/date/amount
        // is the same transaction the user was anticipating. Move its tags to the
        // Teller row and delete the placeholder.
        const placeholder = db
          .select()
          .from(schema.transactions)
          .where(and(
            eq(schema.transactions.accountId, account.id),
            eq(schema.transactions.date, tx.date),
            eq(schema.transactions.amount, amountCents),
            eq(schema.transactions.source, "placeholder"),
          ))
          .get();

        if (placeholder) {
          db.update(schema.transactionTags)
            .set({ transactionId: newTxnId })
            .where(eq(schema.transactionTags.transactionId, placeholder.id))
            .run();
          db.delete(schema.transactions)
            .where(eq(schema.transactions.id, placeholder.id))
            .run();
          resolvedPlaceholders++;
        }
      }
    }

    // Update last synced
    db.update(schema.accounts)
      .set({ lastSynced: now() })
      .where(eq(schema.accounts.id, account.id))
      .run();
  }

  return { newTransactions: newCount, updatedTransactions: updatedCount, resolvedPlaceholders };
}

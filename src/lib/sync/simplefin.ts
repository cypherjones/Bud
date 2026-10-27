import { db, schema } from "@/lib/db";
import { eq, and, isNull } from "drizzle-orm";
import { newId } from "@/lib/utils/ids";
import { now } from "@/lib/utils/format";
import { mapTellerCategory } from "./category-map";

/**
 * SimpleFIN Bridge sync (https://beta-bridge.simplefin.org).
 * Replaced Teller after Teller shut down its API in July 2026.
 *
 * Protocol notes:
 * - A "setup token" (base64-encoded claim URL) is claimed ONCE via POST,
 *   returning an access URL with embedded Basic Auth credentials. The claim
 *   URL is single-use; the access URL is what we persist (encrypted).
 * - GET {accessUrl}/accounts returns ALL connected accounts and their
 *   transactions in one call — one bridge connection covers every bank the
 *   user linked in the SimpleFIN UI.
 * - The bridge expects ≤24 requests/day and limits history windows to ~90
 *   days per request, so we chunk backfills and fetch per-connection (not
 *   per-account like Teller did).
 * - Amounts are signed decimal strings; negative = money out (same
 *   convention as Teller). Dates are unix timestamps.
 */

const MAX_WINDOW_DAYS = 40; // bridge recommends ≤45-day ranges; stay under it

type SimplefinTransaction = {
  id: string;
  posted: number; // unix seconds — 0 or absent while pending
  amount: string; // signed decimal string
  description: string;
  payee?: string;
  memo?: string;
  pending?: boolean;
  transacted_at?: number; // unix seconds
};

type SimplefinAccount = {
  org: { domain?: string; name?: string; "sfin-url"?: string; id?: string };
  id: string;
  name: string;
  currency: string;
  balance: string; // signed decimal string (credit accounts are negative)
  "available-balance"?: string;
  "balance-date": number;
  transactions?: SimplefinTransaction[];
};

type SimplefinAccountSet = {
  errors?: string[];
  errlist?: string[]; // some bridge versions use this key
  accounts: SimplefinAccount[];
};

/**
 * Claim a setup token (one-time). Returns the access URL to persist.
 * The setup token is a base64-encoded claim URL.
 */
export async function claimSetupToken(setupToken: string): Promise<string> {
  const claimUrl = Buffer.from(setupToken.trim(), "base64").toString("utf8").trim();
  if (!/^https:\/\//.test(claimUrl)) {
    throw new Error("Invalid setup token — expected a base64-encoded https claim URL");
  }

  const res = await fetch(claimUrl, {
    method: "POST",
    headers: { "Content-Length": "0" },
  });
  if (!res.ok) {
    throw new Error(`SimpleFIN claim failed: ${res.status} ${res.statusText} (setup tokens are single-use — generate a new one if this was already claimed)`);
  }

  const accessUrl = (await res.text()).trim();
  if (!/^https:\/\/.+:.+@.+/.test(accessUrl)) {
    throw new Error("SimpleFIN claim did not return a valid access URL");
  }
  return accessUrl;
}

/** Split an access URL into a credential-free base URL + Basic auth header. */
function parseAccessUrl(accessUrl: string): { baseUrl: string; authHeader: string } {
  const u = new URL(accessUrl);
  const authHeader = `Basic ${Buffer.from(
    `${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`
  ).toString("base64")}`;
  u.username = "";
  u.password = "";
  return { baseUrl: u.toString().replace(/\/$/, ""), authHeader };
}

/** Fetch the account set (accounts + transactions) for a date window. */
export async function fetchSimplefinAccounts(
  accessUrl: string,
  opts?: { startDate?: Date; endDate?: Date; balancesOnly?: boolean }
): Promise<SimplefinAccountSet> {
  const { baseUrl, authHeader } = parseAccessUrl(accessUrl);

  const params = new URLSearchParams();
  if (opts?.startDate) params.set("start-date", String(Math.floor(opts.startDate.getTime() / 1000)));
  if (opts?.endDate) params.set("end-date", String(Math.floor(opts.endDate.getTime() / 1000)));
  if (opts?.balancesOnly) params.set("balances-only", "1");
  params.set("pending", "1");

  const res = await fetch(`${baseUrl}/accounts?${params}`, {
    headers: { Authorization: authHeader },
  });
  if (!res.ok) {
    throw new Error(`SimpleFIN accounts fetch failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as SimplefinAccountSet;
  const errors = data.errors ?? data.errlist ?? [];
  if (errors.length > 0) {
    // Non-fatal: the bridge reports per-institution issues (e.g. re-auth
    // needed) alongside whatever data it could return. Surface via console.
    console.warn("SimpleFIN reported errors:", errors);
  }
  return data;
}

/** Unix seconds → local YYYY-MM-DD (en-CA locale formats as ISO). */
function toLocalDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-CA");
}

function toCents(amount: string): number {
  return Math.round(parseFloat(amount) * 100);
}

/** Last standalone run of ≥4 digits in an account name, e.g. "Checking ...1234". */
function extractLastFour(name: string): string | null {
  const matches = name.match(/\d{4,}/g);
  if (!matches) return null;
  return matches[matches.length - 1].slice(-4);
}

function looseInstitutionMatch(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/[^a-z0-9]/g, "");
  const nb = b.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

/**
 * Find the existing (Teller-era) account row this SimpleFIN account
 * corresponds to, so balances and history stay on one row. Conservative:
 * only adopts when exactly one candidate matches.
 */
function findLegacyAccountMatch(sa: SimplefinAccount) {
  const unlinked = db
    .select()
    .from(schema.accounts)
    .where(isNull(schema.accounts.simplefinAccountId))
    .all();

  const orgName = sa.org?.name ?? sa.org?.domain ?? "";

  // 1. last-four digits present in the SimpleFIN name + institution match
  const lastFour = extractLastFour(sa.name);
  if (lastFour) {
    const byDigits = unlinked.filter(
      (a) => a.lastFour === lastFour && (orgName === "" || looseInstitutionMatch(a.institution, orgName))
    );
    if (byDigits.length === 1) return byDigits[0];
  }

  // 2. exact name match (case-insensitive), institution loosely matching
  const byName = unlinked.filter(
    (a) =>
      a.name.toLowerCase() === sa.name.toLowerCase() &&
      (orgName === "" || looseInstitutionMatch(a.institution, orgName))
  );
  if (byName.length === 1) return byName[0];

  return undefined;
}

/**
 * Upsert SimpleFIN accounts into the local accounts table.
 * Returns the number of newly created account rows.
 */
export function syncSimplefinAccounts(accountSet: SimplefinAccountSet): number {
  let created = 0;

  for (const sa of accountSet.accounts) {
    const rawBalanceCents = toCents(sa.balance);

    const linked = db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.simplefinAccountId, sa.id))
      .get();

    const existing = linked ?? findLegacyAccountMatch(sa);

    if (existing) {
      // Credit accounts: SimpleFIN reports debt as negative; Bud stores the
      // amount owed as positive (Teller convention the UI was built on).
      const balance = existing.accountType === "credit" ? Math.abs(rawBalanceCents) : rawBalanceCents;
      db.update(schema.accounts)
        .set({ balance, simplefinAccountId: sa.id, lastSynced: now() })
        .where(eq(schema.accounts.id, existing.id))
        .run();
    } else {
      const isCredit = rawBalanceCents < 0;
      db.insert(schema.accounts)
        .values({
          id: newId(),
          name: sa.name,
          institution: sa.org?.name ?? sa.org?.domain ?? "Unknown",
          accountType: isCredit ? "credit" : "depository",
          subtype: null,
          lastFour: extractLastFour(sa.name),
          currency: sa.currency || "USD",
          balance: isCredit ? Math.abs(rawBalanceCents) : rawBalanceCents,
          simplefinAccountId: sa.id,
          lastSynced: now(),
          createdAt: now(),
        })
        .run();
      created++;
    }
  }

  return created;
}

/**
 * Sync transactions from a SimpleFIN account set into the transactions table.
 * Mirrors the old Teller sync semantics: dedup by external ID, pending→posted
 * updates, placeholder resolution — plus cross-provider dedup so the window
 * overlapping the last Teller sync doesn't double-import.
 */
export function syncSimplefinTransactions(accountSet: SimplefinAccountSet): {
  newTransactions: number;
  updatedTransactions: number;
  resolvedPlaceholders: number;
} {
  let newCount = 0;
  let updatedCount = 0;
  let resolvedPlaceholders = 0;

  for (const sa of accountSet.accounts) {
    const account = db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.simplefinAccountId, sa.id))
      .get();
    if (!account) continue;
    if (account.name.startsWith("[EXCLUDED]")) continue;

    for (const tx of sa.transactions ?? []) {
      const externalId = `sfin:${sa.id}:${tx.id}`;
      const isPending = tx.pending === true || !tx.posted;
      const status = isPending ? "pending" : "posted";
      const dateUnix = isPending ? (tx.transacted_at ?? tx.posted) : tx.posted;
      if (!dateUnix) continue;
      const date = toLocalDate(dateUnix);

      const amountCents = Math.abs(toCents(tx.amount));
      const isExpense = parseFloat(tx.amount) < 0;

      const existing = db
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.bankTransactionId, externalId))
        .get();

      if (existing) {
        if (existing.status !== status) {
          db.update(schema.transactions)
            .set({ status, amount: amountCents, date })
            .where(eq(schema.transactions.id, existing.id))
            .run();
          updatedCount++;
        }
        continue;
      }

      // Pending rows can be re-issued with a NEW id once posted. Before
      // inserting a posted row, adopt a matching pending SimpleFIN row.
      if (!isPending) {
        const pendingTwin = db
          .select()
          .from(schema.transactions)
          .where(and(
            eq(schema.transactions.accountId, account.id),
            eq(schema.transactions.amount, amountCents),
            eq(schema.transactions.status, "pending"),
            eq(schema.transactions.source, "simplefin"),
          ))
          .get();
        if (pendingTwin) {
          db.update(schema.transactions)
            .set({ status, date, bankTransactionId: externalId })
            .where(eq(schema.transactions.id, pendingTwin.id))
            .run();
          updatedCount++;
          continue;
        }
      }

      // Cross-provider dedup: the first SimpleFIN sync overlaps the last
      // Teller sync window; the same real-world transaction carries a
      // different external ID on each provider. Same account + date + amount
      // on a teller-sourced row ⇒ already imported, skip.
      const tellerTwin = db
        .select()
        .from(schema.transactions)
        .where(and(
          eq(schema.transactions.accountId, account.id),
          eq(schema.transactions.date, date),
          eq(schema.transactions.amount, amountCents),
          eq(schema.transactions.source, "teller"),
        ))
        .get();
      if (tellerTwin) continue;

      const merchantName = tx.payee ?? tx.description;
      const categoryId = mapTellerCategory(null, merchantName, tx.description, isExpense);

      const newTxnId = newId();
      db.insert(schema.transactions)
        .values({
          id: newTxnId,
          accountId: account.id,
          amount: amountCents,
          type: isExpense ? "expense" : "income",
          description: tx.description,
          merchant: merchantName,
          categoryId,
          date,
          status,
          bankTransactionId: externalId,
          source: "simplefin",
          isRecurring: false,
          createdAt: now(),
        })
        .run();
      newCount++;

      // Resolve placeholder: a user-entered row on the same account/date/amount
      // is the same transaction the user was anticipating.
      const placeholder = db
        .select()
        .from(schema.transactions)
        .where(and(
          eq(schema.transactions.accountId, account.id),
          eq(schema.transactions.date, date),
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

  return { newTransactions: newCount, updatedTransactions: updatedCount, resolvedPlaceholders };
}

/**
 * Full sync for one SimpleFIN connection: accounts + transactions.
 *
 * Window selection: resumes from the connection's lastSynced minus a 10-day
 * overlap (to catch pending→posted transitions). First sync backfills 90
 * days. Backfills longer than the bridge's window limit are chunked.
 */
export async function syncSimplefinConnection(
  accessUrl: string,
  connectionId: string
): Promise<{
  newAccounts: number;
  newTransactions: number;
  updatedTransactions: number;
  resolvedPlaceholders: number;
}> {
  const connection = db
    .select()
    .from(schema.simplefinConnections)
    .where(eq(schema.simplefinConnections.id, connectionId))
    .get();

  let start: Date;
  if (connection?.lastSynced) {
    start = new Date(connection.lastSynced);
    start.setDate(start.getDate() - 10);
  } else {
    start = new Date();
    start.setDate(start.getDate() - 90);
  }

  const totals = {
    newAccounts: 0,
    newTransactions: 0,
    updatedTransactions: 0,
    resolvedPlaceholders: 0,
  };

  // Chunk [start, now] into windows the bridge will accept.
  const windows: Array<{ from: Date; to: Date }> = [];
  const end = new Date();
  let cursor = new Date(start);
  while (cursor < end) {
    const to = new Date(cursor);
    to.setDate(to.getDate() + MAX_WINDOW_DAYS);
    windows.push({ from: new Date(cursor), to: to < end ? to : end });
    cursor = to;
  }

  for (const w of windows) {
    const accountSet = await fetchSimplefinAccounts(accessUrl, {
      startDate: w.from,
      endDate: w.to,
    });
    totals.newAccounts += syncSimplefinAccounts(accountSet);
    const r = syncSimplefinTransactions(accountSet);
    totals.newTransactions += r.newTransactions;
    totals.updatedTransactions += r.updatedTransactions;
    totals.resolvedPlaceholders += r.resolvedPlaceholders;
  }

  db.update(schema.simplefinConnections)
    .set({ lastSynced: now() })
    .where(eq(schema.simplefinConnections.id, connectionId))
    .run();

  return totals;
}

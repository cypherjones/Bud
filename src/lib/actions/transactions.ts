import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { newId } from "@/lib/utils/ids";
import { now, today, parseDollarsToCents } from "@/lib/utils/format";
import { mapTellerCategory } from "@/lib/sync/category-map";

export type CreateTransactionInput = {
  accountId: string;
  amount: number; // dollars (positive number)
  type: "income" | "expense";
  description: string;
  merchant?: string;
  categoryId?: string;
  date?: string; // ISO YYYY-MM-DD; defaults to today
  placeholder?: boolean;
  placeholderTtlDays?: number; // defaults to 14
};

export type CreateTransactionResult =
  | { success: true; id: string; placeholder: boolean }
  | { success: false; error: string };

/**
 * Insert a user-created transaction. When `placeholder` is true, the row is
 * marked source='placeholder' with a TTL — the next Teller sync that brings in
 * a matching row (same account/date/amount) will replace it automatically.
 */
export function createTransaction(input: CreateTransactionInput): CreateTransactionResult {
  if (!input.accountId) return { success: false, error: "accountId is required" };
  if (!input.description?.trim()) return { success: false, error: "description is required" };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { success: false, error: "amount must be a positive number" };
  }
  if (input.type !== "income" && input.type !== "expense") {
    return { success: false, error: "type must be 'income' or 'expense'" };
  }

  const account = db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.id, input.accountId))
    .get();
  if (!account) return { success: false, error: `Account ${input.accountId} not found` };

  const merchant = input.merchant?.trim() || input.description.trim();
  const categoryId =
    input.categoryId ??
    mapTellerCategory(null, merchant, input.description, input.type === "expense");

  const isPlaceholder = input.placeholder === true;
  const ttlDays = input.placeholderTtlDays ?? 14;
  const expiresAt = isPlaceholder
    ? new Date(Date.now() + ttlDays * 86400000).toISOString()
    : null;

  const id = newId();
  db.insert(schema.transactions)
    .values({
      id,
      accountId: input.accountId,
      amount: parseDollarsToCents(input.amount),
      type: input.type,
      description: input.description.trim(),
      merchant,
      categoryId: categoryId ?? null,
      date: input.date ?? today(),
      status: "posted",
      source: isPlaceholder ? "placeholder" : "manual",
      placeholderExpiresAt: expiresAt,
      isRecurring: false,
      createdAt: now(),
    })
    .run();

  return { success: true, id, placeholder: isPlaceholder };
}

/**
 * Find groups of Teller-synced rows that share account+date+amount+description.
 * These are candidates for the same underlying charge that Teller assigned multiple
 * IDs to. Excluded accounts are skipped. Each group has 2+ row ids.
 */
export type DuplicateCandidate = {
  accountId: string;
  accountName: string;
  date: string;
  amount: number; // cents
  description: string;
  rows: { id: string; bankTransactionId: string | null; createdAt: string; categoryName: string | null }[];
};

export function getDuplicateCandidates(): DuplicateCandidate[] {
  const rows = db
    .select({
      id: schema.transactions.id,
      accountId: schema.transactions.accountId,
      accountName: schema.accounts.name,
      date: schema.transactions.date,
      amount: schema.transactions.amount,
      description: schema.transactions.description,
      bankTransactionId: schema.transactions.bankTransactionId,
      createdAt: schema.transactions.createdAt,
      categoryName: schema.categories.name,
      excludeFromReports: schema.accounts.excludeFromReports,
    })
    .from(schema.transactions)
    .leftJoin(schema.accounts, eq(schema.transactions.accountId, schema.accounts.id))
    .leftJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
    .all();

  const groups = new Map<string, DuplicateCandidate>();
  for (const r of rows) {
    if (!r.bankTransactionId) continue; // Teller-only
    if (r.excludeFromReports) continue;
    if (!r.accountId) continue;
    const key = `${r.accountId}|${r.date}|${r.amount}|${r.description}`;
    if (!groups.has(key)) {
      groups.set(key, {
        accountId: r.accountId,
        accountName: r.accountName ?? "Unknown",
        date: r.date,
        amount: r.amount,
        description: r.description,
        rows: [],
      });
    }
    groups.get(key)!.rows.push({
      id: r.id,
      bankTransactionId: r.bankTransactionId,
      createdAt: r.createdAt,
      categoryName: r.categoryName,
    });
  }

  return [...groups.values()]
    .filter((g) => g.rows.length > 1)
    .map((g) => ({ ...g, rows: g.rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) }));
}

/**
 * Merge duplicate transactions: move all tags from `loserIds` onto `keeperId`,
 * then delete the losers. Returns the number of rows deleted.
 */
export function mergeDuplicates(keeperId: string, loserIds: string[]): { deleted: number } {
  if (!loserIds.length) return { deleted: 0 };
  if (loserIds.includes(keeperId)) {
    throw new Error("keeperId cannot also be in loserIds");
  }

  const keeper = db.select().from(schema.transactions).where(eq(schema.transactions.id, keeperId)).get();
  if (!keeper) throw new Error(`Keeper transaction ${keeperId} not found`);

  let deleted = 0;
  for (const loserId of loserIds) {
    const loser = db.select().from(schema.transactions).where(eq(schema.transactions.id, loserId)).get();
    if (!loser) continue;
    db.update(schema.transactionTags)
      .set({ transactionId: keeperId })
      .where(eq(schema.transactionTags.transactionId, loserId))
      .run();
    db.delete(schema.transactions).where(eq(schema.transactions.id, loserId)).run();
    deleted++;
  }

  return { deleted };
}

/**
 * Resolve a name fragment (e.g. "Chime", "0883") to an account id.
 * Used by the AI tool so the user doesn't need to know IDs.
 */
export function findAccountByQuery(query: string): typeof schema.accounts.$inferSelect | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const accounts = db.select().from(schema.accounts).all();
  const byLastFour = accounts.find((a) => a.lastFour && q.includes(a.lastFour));
  if (byLastFour) return byLastFour;
  return (
    accounts.find((a) => a.name.toLowerCase().includes(q)) ??
    accounts.find((a) => a.institution.toLowerCase().includes(q)) ??
    null
  );
}

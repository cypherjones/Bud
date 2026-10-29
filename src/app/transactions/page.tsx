import { db, schema } from "@/lib/db";
import { desc, eq, and, gte, lte, inArray, notInArray } from "drizzle-orm";
import { getExcludedAccountIds, getActiveReportingMonth, getInternalCategoryIds } from "@/lib/actions/dashboard";
import { displayName } from "@/lib/actions/balances";
import { PlanPage, TotalsStrip, Total } from "@/components/plan/plan-ui";
import { cn } from "@/lib/utils";
import { bankSyncAllowed } from "@/app/settings/sync-guard";
import { EmptyMonthBanner } from "@/components/dashboard/empty-month-banner";
import { formatCurrency } from "@/lib/utils/format";
import { TransactionFilters } from "@/components/transactions/transaction-filters";
import { SyncButton } from "@/components/transactions/sync-button";
import { CategorySelect } from "@/components/transactions/category-select";
import { TagEditor } from "@/components/transactions/tag-editor";
import { AddTransactionDialog } from "@/components/transactions/add-transaction-dialog";
import { DuplicateReviewPanel } from "@/components/transactions/duplicate-review-panel";
import { getDuplicateCandidates } from "@/lib/actions/transactions";

export const dynamic = "force-dynamic";

/** Start and end (inclusive) for a range; null means unbounded. */
function getDateRange(range: string | undefined): { start: string | null; end: string | null; label: string } {
  const now = new Date();
  const d = (y: number, m: number, day: number) => new Date(y, m, day).toLocaleDateString("en-CA");
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (range) {
    case "last-month":
      return { start: d(y, m - 1, 1), end: d(y, m, 0), label: new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long" }) };
    case "3-months":
      return { start: d(y, m - 3, 1), end: null, label: `${new Date(y, m - 3, 1).toLocaleDateString("en-US", { month: "long" })} to today` };
    case "all":
      return { start: null, end: null, label: "All time" };
    case "this-month":
    default:
      return { start: d(y, m, 1), end: null, label: new Date(y, m, 1).toLocaleDateString("en-US", { month: "long" }) };
  }
}

/** Enough to scroll on a phone; narrow the range for more. */
const ROW_LIMIT = 400;

interface PageProps {
  searchParams: Promise<{ range?: string; category?: string }>;
}

export default async function TransactionsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const range = params.range;
  const categoryFilter = params.category;

  // Build query conditions. When the user hasn't picked a range, default to
  // the active reporting month — this is current month if it has data, prior
  // month otherwise. Avoids the "first day of month → empty list" trap.
  const activeMonth = !range || range === "this-month" ? getActiveReportingMonth() : null;
  const conditions = [];
  const window = getDateRange(range);
  const startDate = activeMonth ? activeMonth.monthStart : window.start;
  const endDate = activeMonth ? null : window.end;
  if (startDate) {
    conditions.push(gte(schema.transactions.date, startDate));
  }
  if (endDate) {
    conditions.push(lte(schema.transactions.date, endDate));
  }
  if (categoryFilter && categoryFilter !== "all") {
    conditions.push(eq(schema.transactions.categoryId, categoryFilter));
  }
  const excludedAccounts = getExcludedAccountIds();
  if (excludedAccounts.length > 0) {
    conditions.push(notInArray(schema.transactions.accountId, excludedAccounts));
  }

  // Fetch transactions with their categories
  const transactions = await db
    .select({
      id: schema.transactions.id,
      amount: schema.transactions.amount,
      type: schema.transactions.type,
      description: schema.transactions.description,
      merchant: schema.transactions.merchant,
      date: schema.transactions.date,
      status: schema.transactions.status,
      categoryId: schema.transactions.categoryId,
      categoryName: schema.categories.name,
      categoryColor: schema.categories.color,
      categoryIcon: schema.categories.icon,
      accountName: schema.accounts.name,
      accountInstitution: schema.accounts.institution,
      accountLastFour: schema.accounts.lastFour,
    })
    .from(schema.transactions)
    .leftJoin(
      schema.categories,
      eq(schema.transactions.categoryId, schema.categories.id),
    )
    .leftJoin(
      schema.accounts,
      eq(schema.transactions.accountId, schema.accounts.id),
    )
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.transactions.date))
    .all();
  const internal = new Set(getInternalCategoryIds());
  const isMove = (t: { categoryId: string | null }) => !!t.categoryId && internal.has(t.categoryId);
  const totals = {
    in: transactions.filter((t) => t.type === "income" && !isMove(t)).reduce((s, t) => s + t.amount, 0),
    out: transactions.filter((t) => t.type === "expense" && !isMove(t)).reduce((s, t) => s + t.amount, 0),
    moves: transactions.filter(isMove).length,
  };
  const shown = transactions.slice(0, ROW_LIMIT);

  // Fetch all categories for the filter dropdown
  const categories = await db
    .select({
      id: schema.categories.id,
      name: schema.categories.name,
      color: schema.categories.color,
      groupId: schema.categories.groupId,
      groupName: schema.categoryGroups.name,
      groupColor: schema.categoryGroups.color,
      groupSort: schema.categoryGroups.sortOrder,
    })
    .from(schema.categories)
    .leftJoin(
      schema.categoryGroups,
      eq(schema.categories.groupId, schema.categoryGroups.id),
    )
    .all();

  // Accounts available for manual entry (omit excluded accounts like Business Checking)
  const accountsForEntry = await db
    .select({
      id: schema.accounts.id,
      name: schema.accounts.name,
      institution: schema.accounts.institution,
      lastFour: schema.accounts.lastFour,
      tellerAccountId: schema.accounts.tellerAccountId,
      simplefinAccountId: schema.accounts.simplefinAccountId,
    })
    .from(schema.accounts)
    .where(eq(schema.accounts.excludeFromReports, false))
    .all();

  const duplicateCandidates = getDuplicateCandidates();

  // Fetch all tags (for the TagEditor dropdown — needs every tag the user could
  // attach, not just ones already attached).
  const allTags = await db.select().from(schema.tags).all();

  // Fetch transaction-tag mappings — scoped to the transactions on this page
  // so we don't pull the entire `transaction_tags` table for a single month view.
  const visibleTxIds = shown.map((t) => t.id);
  const txTagRows = visibleTxIds.length > 0
    ? await db
        .select({
          transactionId: schema.transactionTags.transactionId,
          tagId: schema.tags.id,
          tagName: schema.tags.name,
          tagColor: schema.tags.color,
        })
        .from(schema.transactionTags)
        .innerJoin(schema.tags, eq(schema.transactionTags.tagId, schema.tags.id))
        .where(inArray(schema.transactionTags.transactionId, visibleTxIds))
        .all()
    : [];

  // Group tags by transaction ID. Dedup defensively — the schema has no unique
  // constraint on (transactionId, tagId), so the same pair could appear twice.
  // See audit follow-up for the migration.
  const tagsByTxId = new Map<string, { id: string; name: string; color: string }[]>();
  const seenTagKeys = new Set<string>();
  for (const row of txTagRows) {
    const key = `${row.transactionId}:${row.tagId}`;
    if (seenTagKeys.has(key)) continue;
    seenTagKeys.add(key);
    if (!tagsByTxId.has(row.transactionId)) tagsByTxId.set(row.transactionId, []);
    tagsByTxId.get(row.transactionId)!.push({ id: row.tagId, name: row.tagName, color: row.tagColor });
  }

  const canSync = bankSyncAllowed();
  const label = activeMonth ? activeMonth.monthLabel : window.label;

  return (
    <PlanPage
      title="Transactions"
      sub="Everything the banks have sent. Transfers between your own accounts and card payments are dimmed and left out of the totals."
      actions={
        <>
          <AddTransactionDialog accounts={accountsForEntry} categories={categories} />
          {canSync && <SyncButton />}
        </>
      }
    >
      {activeMonth?.isFallback && activeMonth.fallbackReason && <EmptyMonthBanner reason={activeMonth.fallbackReason} />}

      <DuplicateReviewPanel candidates={duplicateCandidates} />

      <div className="space-y-4">
        <TransactionFilters categories={categories} />

        <TotalsStrip cols={3}>
          <Total label={`In, ${label}`} value={formatCurrency(totals.in)} tone="text-emerald-400" />
          <Total label={`Spent, ${label}`} value={formatCurrency(totals.out)} />
          <Total label="Moves and card payments" value={String(totals.moves)} note="Not counted as spending or income" />
        </TotalsStrip>

        {transactions.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            {categoryFilter && categoryFilter !== "all" ? "Nothing in this category for this range." : "Nothing in this range."}
          </p>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {shown.map((tx) => {
              const isIncome = tx.type === "income";
              const moved = isMove(tx);
              const date = new Date(tx.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
              return (
                <div key={tx.id} className={cn("px-4 py-2.5", moved && "opacity-60")}>
                  <div className="flex items-baseline gap-3">
                    <p className="flex-1 min-w-0 truncate font-medium text-sm">{tx.merchant ?? tx.description}</p>
                    <p className={cn("font-mono tabular-nums text-sm whitespace-nowrap", isIncome && "text-emerald-400")}>
                      {isIncome ? "+" : "−"}
                      {formatCurrency(Math.abs(tx.amount))}
                    </p>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="whitespace-nowrap">{date}</span>
                    <span className="truncate max-w-[12rem]">{tx.accountName ? displayName(tx.accountName, tx.accountInstitution) : "—"}</span>
                    <CategorySelect
                      transactionId={tx.id}
                      currentCategory={{ name: tx.categoryName, color: tx.categoryColor, icon: tx.categoryIcon }}
                      categories={categories}
                    />
                    <TagEditor transactionId={tx.id} tags={tagsByTxId.get(tx.id) ?? []} allTags={allTags} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {transactions.length > 0 && (
          <p className="text-xs text-muted-foreground text-right">
            {transactions.length > ROW_LIMIT
              ? `Showing the newest ${ROW_LIMIT} of ${transactions.length}. Pick a shorter range to see the rest.`
              : `${transactions.length} transaction${transactions.length !== 1 ? "s" : ""}`}
          </p>
        )}
      </div>
    </PlanPage>
  );
}

import { db, schema } from "@/lib/db";
import { desc, eq, and, gte, notInArray } from "drizzle-orm";
import { getExcludedAccountIds } from "@/lib/actions/dashboard";
import { formatCurrency } from "@/lib/utils/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { TransactionFilters } from "@/components/transactions/transaction-filters";
import { SyncButton } from "@/components/transactions/sync-button";
import { CategorySelect } from "@/components/transactions/category-select";
import { TagEditor } from "@/components/transactions/tag-editor";
import { AddTransactionDialog } from "@/components/transactions/add-transaction-dialog";
import { DuplicateReviewPanel } from "@/components/transactions/duplicate-review-panel";
import { getDuplicateCandidates } from "@/lib/actions/transactions";

export const dynamic = "force-dynamic";

function getDateRange(range: string | undefined): string | null {
  const now = new Date();
  switch (range) {
    case "last-month": {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return d.toISOString().split("T")[0];
    }
    case "3-months": {
      const d = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      return d.toISOString().split("T")[0];
    }
    case "all":
      return null;
    case "this-month":
    default: {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return d.toISOString().split("T")[0];
    }
  }
}

interface PageProps {
  searchParams: Promise<{ range?: string; category?: string }>;
}

export default async function TransactionsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const range = params.range;
  const categoryFilter = params.category;

  // Build query conditions
  const conditions = [];
  const startDate = getDateRange(range);
  if (startDate) {
    conditions.push(gte(schema.transactions.date, startDate));
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
    })
    .from(schema.transactions)
    .leftJoin(
      schema.categories,
      eq(schema.transactions.categoryId, schema.categories.id),
    )
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.transactions.date))
    .all();

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
    })
    .from(schema.accounts)
    .where(eq(schema.accounts.excludeFromReports, false))
    .all();

  const duplicateCandidates = getDuplicateCandidates();

  // Fetch all tags
  const allTags = await db.select().from(schema.tags).all();

  // Fetch transaction-tag mappings
  const txTagRows = await db
    .select({
      transactionId: schema.transactionTags.transactionId,
      tagId: schema.tags.id,
      tagName: schema.tags.name,
      tagColor: schema.tags.color,
    })
    .from(schema.transactionTags)
    .innerJoin(schema.tags, eq(schema.transactionTags.tagId, schema.tags.id))
    .all();

  // Group tags by transaction ID (deduplicate)
  const tagsByTxId = new Map<string, { id: string; name: string; color: string }[]>();
  const seenTagKeys = new Set<string>();
  for (const row of txTagRows) {
    const key = `${row.transactionId}:${row.tagId}`;
    if (seenTagKeys.has(key)) continue;
    seenTagKeys.add(key);
    if (!tagsByTxId.has(row.transactionId)) tagsByTxId.set(row.transactionId, []);
    tagsByTxId.get(row.transactionId)!.push({ id: row.tagId, name: row.tagName, color: row.tagColor });
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="px-8 py-6 border-b border-border bg-card/50 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
          <p className="text-sm text-muted-foreground">
            Synced from your bank accounts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AddTransactionDialog accounts={accountsForEntry} categories={categories} />
          <SyncButton />
        </div>
      </header>
      <div className="flex-1 overflow-auto p-8 space-y-6">
        <DuplicateReviewPanel candidates={duplicateCandidates} />

        {/* Filters */}
        <TransactionFilters categories={categories} />

        {/* Transaction Table */}
        {transactions.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  No transactions found
                </p>
                <p className="text-xs text-muted-foreground">
                  {categoryFilter && categoryFilter !== "all"
                    ? "Try changing the category filter or date range."
                    : "Connect your bank in Settings to see transactions here."}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Date</TableHead>
                    <TableHead>Merchant</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="pr-4">Tags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => {
                    const isIncome = tx.type === "income";
                    const formattedDate = new Date(
                      tx.date + "T00:00:00",
                    ).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    });

                    return (
                      <TableRow key={tx.id}>
                        <TableCell className="pl-4 text-muted-foreground">
                          {formattedDate}
                        </TableCell>
                        <TableCell className="font-medium">
                          {tx.merchant ?? tx.description}
                        </TableCell>
                        <TableCell
                          className={
                            isIncome
                              ? "text-emerald-600 dark:text-emerald-400 font-medium"
                              : "font-medium"
                          }
                        >
                          {isIncome ? "+" : "-"}
                          {formatCurrency(Math.abs(tx.amount))}
                        </TableCell>
                        <TableCell>
                          <CategorySelect
                            transactionId={tx.id}
                            currentCategory={{
                              name: tx.categoryName,
                              color: tx.categoryColor,
                              icon: tx.categoryIcon,
                            }}
                            categories={categories}
                          />
                        </TableCell>
                        <TableCell className="pr-4">
                          <TagEditor
                            transactionId={tx.id}
                            tags={tagsByTxId.get(tx.id) ?? []}
                            allTags={allTags}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Summary footer */}
        {transactions.length > 0 && (
          <p className="text-xs text-muted-foreground text-right">
            Showing {transactions.length} transaction
            {transactions.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  );
}

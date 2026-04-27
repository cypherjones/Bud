import { db, schema } from "@/lib/db";
import { desc, eq, and, gte } from "drizzle-orm";
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
    })
    .from(schema.categories)
    .all();

  return (
    <div className="flex flex-col h-screen">
      <header className="px-8 py-6 border-b border-border bg-card/50">
        <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
        <p className="text-sm text-muted-foreground">
          Synced from your bank accounts
        </p>
      </header>
      <div className="flex-1 overflow-auto p-8 space-y-6">
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
                    <TableHead className="pr-4">Status</TableHead>
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
                          {tx.categoryName ? (
                            <Badge
                              variant="secondary"
                              className="text-xs"
                              style={
                                tx.categoryColor
                                  ? {
                                      backgroundColor: `${tx.categoryColor}20`,
                                      color: tx.categoryColor,
                                      borderColor: `${tx.categoryColor}40`,
                                    }
                                  : undefined
                              }
                            >
                              {tx.categoryIcon && (
                                <span className="mr-1">{tx.categoryIcon}</span>
                              )}
                              {tx.categoryName}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Uncategorized
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="pr-4">
                          <Badge
                            variant={
                              tx.status === "posted" ? "secondary" : "outline"
                            }
                            className="text-xs capitalize"
                          >
                            {tx.status}
                          </Badge>
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

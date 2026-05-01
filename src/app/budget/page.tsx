import { getBudgetOverview, getBudgetSummary } from "@/lib/actions/budget";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { formatCurrency } from "@/lib/utils/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BudgetCategoryRow } from "@/components/budget/budget-category-row";
import { AddBudgetRow } from "@/components/budget/add-budget-row";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  const overview = getBudgetOverview();
  const summary = getBudgetSummary();

  // Get all categories with groups for the "add budget" dropdown
  const allCategories = await db
    .select({
      id: schema.categories.id,
      name: schema.categories.name,
      color: schema.categories.color,
      groupName: schema.categoryGroups.name,
    })
    .from(schema.categories)
    .leftJoin(schema.categoryGroups, eq(schema.categories.groupId, schema.categoryGroups.id))
    .all();

  const budgetedCategoryIds = new Set(overview.map((b) => b.categoryId));
  const unbudgetedCategories = allCategories.filter((c) => !budgetedCategoryIds.has(c.id));

  // Group budgets by parent category group
  const groups = new Map<string, typeof overview>();
  for (const row of overview) {
    const key = row.groupName ?? "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const hasBudgets = overview.length > 0;
  const overallColor = summary.percentUsed > 100 ? "text-red-500" : summary.percentUsed > 80 ? "text-amber-500" : "text-emerald-600";

  return (
    <div className="flex flex-col h-screen">
      <header className="px-8 py-6 border-b border-border bg-card/50">
        <h1 className="text-2xl font-bold tracking-tight">Budget</h1>
        <p className="text-sm text-muted-foreground">
          Monthly budget vs actual spending
        </p>
      </header>
      <div className="flex-1 overflow-auto p-8 space-y-6">
        {/* Summary Cards */}
        {hasBudgets && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Total Budgeted</p>
                  <p className="text-2xl font-bold tracking-tight mt-1">{formatCurrency(summary.totalBudgeted)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Total Spent</p>
                  <p className="text-2xl font-bold tracking-tight mt-1">{formatCurrency(summary.totalSpent)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Remaining</p>
                  <p className={`text-2xl font-bold tracking-tight mt-1 ${summary.totalRemaining >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {summary.totalRemaining >= 0 ? formatCurrency(summary.totalRemaining) : `-${formatCurrency(Math.abs(summary.totalRemaining))}`}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Budget Used</p>
                  <p className={`text-2xl font-bold tracking-tight mt-1 ${overallColor}`}>{summary.percentUsed}%</p>
                </CardContent>
              </Card>
            </div>

            {/* Overall Progress */}
            <Card>
              <CardContent className="pt-5">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Overall Progress</span>
                  <span className="font-medium">{summary.percentUsed}%</span>
                </div>
                <Progress value={Math.min(summary.percentUsed, 100)} className="h-3" />
              </CardContent>
            </Card>
          </>
        )}

        {/* Budget Groups */}
        {hasBudgets ? (
          [...groups.entries()].map(([groupName, rows]) => {
            const groupSpent = rows.reduce((s, r) => s + r.spent, 0);
            const groupBudgeted = rows.reduce((s, r) => s + r.budgeted, 0);
            const groupPct = groupBudgeted > 0 ? Math.round((groupSpent / groupBudgeted) * 100) : 0;

            return (
              <Card key={groupName}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">{groupName}</CardTitle>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground">
                        {formatCurrency(groupSpent)} / {formatCurrency(groupBudgeted)}
                      </span>
                      <span className={`font-medium ${groupPct > 100 ? "text-red-500" : groupPct > 80 ? "text-amber-500" : "text-emerald-600"}`}>
                        {groupPct}%
                      </span>
                    </div>
                  </div>
                  <Progress value={Math.min(groupPct, 100)} className="h-1.5 mt-2" />
                </CardHeader>
                <CardContent className="divide-y divide-border">
                  {rows.map((row) => (
                    <BudgetCategoryRow
                      key={row.budgetId}
                      budgetId={row.budgetId}
                      categoryName={row.categoryName}
                      categoryColor={row.categoryColor}
                      budgeted={row.budgeted}
                      spent={row.spent}
                      remaining={row.remaining}
                      percentUsed={row.percentUsed}
                    />
                  ))}
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card>
            <CardContent className="py-12 text-center space-y-2">
              <p className="text-sm font-medium text-muted-foreground">No budgets set</p>
              <p className="text-xs text-muted-foreground">
                Add budgets below or tell Bud in Chat to set them for you.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Add Budget */}
        <Card>
          <CardContent className="pt-4">
            <AddBudgetRow unbugdgetedCategories={unbudgetedCategories} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

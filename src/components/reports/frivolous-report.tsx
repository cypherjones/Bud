"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { CategorySelect } from "@/components/transactions/category-select";
import { AlertTriangle } from "lucide-react";

type Category = {
  id: string;
  name: string;
  color: string | null;
  groupId: string | null;
  groupName: string | null;
  groupColor: string | null;
  groupSort: number | null;
};

type Props = {
  data: {
    items: { merchant: string | null; amount: number; date: string; categoryName: string | null }[];
    total: number;
    percentage: number;
    monthlyProjection: number;
    annualProjection: number;
    daysInWindow: number;
    isVolatile: boolean;
    byCategory: { name: string; value: number; color: string }[];
    otherCategoryItems: { id: string; merchant: string | null; amount: number; date: string; categoryId: string | null; categoryName: string | null; categoryColor: string | null }[];
    otherCategoryTotal: number;
  };
  categories: Category[];
};

// Heuristic: flag merchants in the "Other" bucket that almost certainly belong
// elsewhere. Surfacing the suggestion in the row tells the user "hey this is
// probably Business / Debt / Tax — recategorize." The actual recategorization
// is one click via the inline CategorySelect.
function suggestRecategorization(merchant: string | null): string | null {
  if (!merchant) return null;
  const m = merchant.toUpperCase();
  if (m.includes("GUSTO") && m.includes("TAX")) return "Tax (Gusto payroll tax)";
  if (m.includes("GUSTO")) return "Business (Gusto payroll)";
  if (m.includes("CAPITAL ONE") && (m.includes("PYMT") || m.includes("PAYMENT"))) return "Debt Payment";
  if (m.includes("HCTRA") || m.includes("TOLL")) return "Transportation (Tolls)";
  if (m.includes("MVD") || m.includes("DMV")) return "Transportation (DMV)";
  if (m.includes("BRIDGECREST") || m.includes("AFFIRM") || m.includes("AFTERPAY")) return "Debt Payment";
  if (m.includes("APPLECARD") && m.includes("PAYMENT")) return "Debt Payment";
  return null;
}

function shortDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function FrivolousReport({ data, categories }: Props) {
  const donutData = data.byCategory.map((c) => ({ ...c, value: c.value / 100 }));

  return (
    <div className="space-y-6">
      {/* Header Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Discretionary (last {data.daysInWindow}d)</p>
            <p className="text-2xl font-bold tracking-tight mt-1 text-red-500">{formatCurrency(data.total)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">by category — not AI tagged</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">% of Total Spending</p>
            <p className="text-2xl font-bold tracking-tight mt-1">{data.percentage}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Run Rate</p>
            {data.isVolatile ? (
              <>
                <p className="text-2xl font-bold tracking-tight mt-1 text-muted-foreground">—</p>
                <p className="text-xs text-amber-500 mt-1">
                  Need {7 - data.daysInWindow} more day{7 - data.daysInWindow !== 1 ? "s" : ""} of data
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold tracking-tight mt-1 text-red-500">{formatCurrency(data.monthlyProjection)}/mo</p>
                <p className="text-xs text-muted-foreground mt-1">{formatCurrency(data.annualProjection)}/yr</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Transactions</p>
            <p className="text-2xl font-bold tracking-tight mt-1">{data.items.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Donut + List */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">By Category</CardTitle>
          </CardHeader>
          <CardContent>
            {donutData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={85}
                      dataKey="value"
                      stroke="none"
                    >
                      {donutData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `$${Number(value).toFixed(2)}`} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-3 mt-2">
                  {donutData.map((c) => (
                    <div key={c.name} className="flex items-center gap-1.5 text-xs">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">No frivolous spending found</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Top Frivolous Transactions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.items.slice(0, 12).map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">{item.merchant ?? "Unknown"}</span>
                  <span className="text-xs text-muted-foreground ml-2">{item.categoryName}</span>
                </div>
                <span className="text-sm font-medium text-red-500">{formatCurrency(item.amount)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* "Other" catch-all drill-down — the single biggest leak in most users'
          discretionary report is misclassified items in the Other bucket
          (business expenses, debt payments, taxes, tolls). Surface them with
          inline recategorization so the user can knock them out in one sitting. */}
      {data.otherCategoryItems.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              &quot;Other&quot; bucket — last 30 days
              <span className="text-xs font-normal text-muted-foreground">
                · {formatCurrency(data.otherCategoryTotal)} across {data.otherCategoryItems.length} txn{data.otherCategoryItems.length !== 1 ? "s" : ""}
              </span>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              The catch-all category usually hides misclassified items. Recategorize the suggested ones to a real
              category and your discretionary number will drop accordingly. Click the badge to change.
            </p>
          </CardHeader>
          <CardContent className="space-y-1">
            {data.otherCategoryItems.map((item) => {
              const suggestion = suggestRecategorization(item.merchant);
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-xs text-muted-foreground shrink-0 w-12">{shortDate(item.date)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{item.merchant ?? "Unknown"}</p>
                      {suggestion && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                          → likely belongs in <strong>{suggestion}</strong>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <CategorySelect
                      transactionId={item.id}
                      currentCategory={{
                        name: item.categoryName,
                        color: item.categoryColor,
                        icon: null,
                      }}
                      categories={categories}
                    />
                    <span className="text-sm font-medium tabular-nums w-20 text-right">
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* How this is computed */}
      <Card className="border-blue-200 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-900">
        <CardContent className="pt-5">
          <p className="text-sm font-medium">How is this categorized?</p>
          <p className="text-sm text-muted-foreground mt-1">
            <strong>No AI involved.</strong> This list is auto-derived from a fixed set of category names
            (Restaurants, Coffee &amp; Cafes, Entertainment, Vape &amp; Tobacco, Adult Content, Peer-to-Peer,
            Other, Books, Clothing, Shopping, etc.). To adjust:
          </p>
          <ul className="text-sm text-muted-foreground mt-2 ml-4 list-disc space-y-1">
            <li>Recategorize a transaction so it lands in (or out of) one of those categories</li>
            <li>Tag a single transaction <code className="text-xs bg-muted px-1 rounded">#essential</code> to force-exclude it</li>
            <li>Tag a single transaction <code className="text-xs bg-muted px-1 rounded">#frivolous</code> to force-include it</li>
          </ul>
        </CardContent>
      </Card>

      {/* Actionable Insight */}
      <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800">
        <CardContent className="pt-5">
          <p className="text-sm font-medium">Cutting Discretionary Spending</p>
          {data.isVolatile ? (
            <p className="text-sm text-muted-foreground mt-1">
              {formatCurrency(data.total)} flagged in the last {data.daysInWindow} day
              {data.daysInWindow !== 1 ? "s" : ""}. Run-rate projection waits until you have at least
              7 days of data so a single outlier doesn&apos;t skew the number.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">
              At your current pace ({formatCurrency(data.monthlyProjection)}/mo), eliminating all discretionary spending
              would free {formatCurrency(data.annualProjection)}/yr. Cutting just 50% adds {formatCurrency(Math.round(data.monthlyProjection / 2))}/month
              toward the monthly gap or debt.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

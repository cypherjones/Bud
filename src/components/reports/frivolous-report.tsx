"use client";

import { SectionHead, TotalsStrip, Total, Aside } from "@/components/plan/plan-ui";
import { formatCurrency } from "@/lib/utils/format";
import { CategorySelect } from "@/components/transactions/category-select";

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
  const top = data.byCategory[0]?.value ?? 0;

  return (
    <div className="space-y-10">
      <TotalsStrip cols={4}>
        <Total
          label="Discretionary"
          value={formatCurrency(data.total)}
          note={`this month, ${data.daysInWindow} day${data.daysInWindow !== 1 ? "s" : ""} in`}
        />
        <Total label="Share of spending" value={`${data.percentage}%`} note="of everything spent this month" />
        <Total
          label="Monthly pace"
          value={data.isVolatile ? "—" : formatCurrency(data.monthlyProjection)}
          tone={data.isVolatile ? "text-muted-foreground" : undefined}
          note={
            data.isVolatile
              ? `needs ${7 - data.daysInWindow} more day${7 - data.daysInWindow !== 1 ? "s" : ""} of data`
              : `${formatCurrency(data.annualProjection)} a year at this pace`
          }
        />
        <Total label="Purchases" value={String(data.items.length)} />
      </TotalsStrip>

      <div className="grid gap-10 md:grid-cols-2">
        <section className="space-y-3">
          <SectionHead title="By category" />
          {data.byCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing discretionary this month.</p>
          ) : (
            <ul className="space-y-2.5">
              {data.byCategory.map((c) => (
                <li key={c.name} className="text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate">{c.name}</span>
                    <span className="font-mono tabular-nums">{formatCurrency(c.value)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${top > 0 ? Math.max(2, (c.value / top) * 100) : 0}%`, backgroundColor: c.color }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <SectionHead title="Biggest purchases" />
          <ul className="divide-y divide-border text-sm">
            {data.items.slice(0, 12).map((item, i) => (
              <li key={i} className="flex items-baseline gap-3 py-1.5">
                <span className="w-12 shrink-0 text-xs text-muted-foreground">{shortDate(item.date)}</span>
                <span className="flex-1 min-w-0 truncate">
                  {item.merchant ?? "Unknown"}
                  <span className="ml-2 text-xs text-muted-foreground">{item.categoryName}</span>
                </span>
                <span className="font-mono tabular-nums">{formatCurrency(item.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* The "Other" catch-all hides things that belong in a real category.
          It isn't counted as discretionary, so filing these properly fixes
          the category totals rather than the number above. */}
      {data.otherCategoryItems.length > 0 && (
        <section className="space-y-3">
          <SectionHead
            title="Filed under Other"
            sub={`${formatCurrency(data.otherCategoryTotal)} across ${data.otherCategoryItems.length} in the last 30 days. Tap the badge to give each one a real category.`}
          />
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {data.otherCategoryItems.map((item) => {
              const suggestion = suggestRecategorization(item.merchant);
              return (
                <li key={item.id} className="px-4 py-2.5">
                  <div className="flex items-baseline gap-3">
                    <span className="w-12 shrink-0 text-xs text-muted-foreground">{shortDate(item.date)}</span>
                    <span className="flex-1 min-w-0 truncate text-sm font-medium">{item.merchant ?? "Unknown"}</span>
                    <span className="font-mono tabular-nums text-sm">{formatCurrency(item.amount)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[3.75rem]">
                    <CategorySelect
                      transactionId={item.id}
                      currentCategory={{ name: item.categoryName, color: item.categoryColor, icon: null }}
                      categories={categories}
                    />
                    {suggestion && <span className="text-xs text-amber-500">probably {suggestion}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Aside title="How this is counted">
        <p>
          Discretionary is every purchase in Restaurants, Coffee &amp; Cafes, Entertainment, Vape &amp; Tobacco, Peer-to-Peer,
          Books, Clothing, Shopping and the like. Tag a purchase <code className="text-xs bg-muted px-1 rounded">#essential</code> to
          leave it out, or <code className="text-xs bg-muted px-1 rounded">#frivolous</code> to count it.
        </p>
        {!data.isVolatile && (
          <p>
            Cutting it in half frees about {formatCurrency(Math.round(data.monthlyProjection / 2))} a month for the debts.
          </p>
        )}
      </Aside>
    </div>
  );
}

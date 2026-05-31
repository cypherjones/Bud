import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/utils/format";
import type { BudgetStrategy } from "@/lib/actions/budget";
import type { BudgetRow } from "@/lib/actions/budget";

type Props = {
  strategy: BudgetStrategy;
  overview: BudgetRow[]; // calendar-month budget vs spent rows
};

/**
 * Honest replacement for the old "Total Budgeted / Total Spent" cards.
 * The old framing pretended "Total Spent" was all spend; really it was only
 * spend in budgeted categories — so a user with 6 budgets covering 30% of
 * their actual spend could see "60% used" while overspending massively
 * elsewhere.
 *
 * This panel shows:
 *  - Total trailing-30 expenses (real, all-in)
 *  - How much of that is covered by an explicit budget
 *  - Honored vs blown count
 */
export function BudgetCoveragePanel({ strategy, overview }: Props) {
  const totalSpend = strategy.totalExpensesMonthly;
  const totalBudgeted = overview.reduce((s, r) => s + r.budgeted, 0);
  const totalSpentInBudgeted = overview.reduce((s, r) => s + r.spent, 0);
  const coveragePct = totalSpend > 0 ? Math.round((totalSpentInBudgeted / totalSpend) * 100) : 0;
  const honoredCount = overview.filter((r) => r.percentUsed <= 100).length;
  const blownCount = overview.filter((r) => r.percentUsed > 100).length;
  const blownOverage = overview
    .filter((r) => r.percentUsed > 100)
    .reduce((s, r) => s + Math.abs(r.remaining), 0);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="pt-5">
          <p className="text-xs text-muted-foreground">Total Expenses (30d)</p>
          <p className="text-2xl font-bold tracking-tight mt-1">{formatCurrency(totalSpend)}</p>
          <p className="text-[11px] text-muted-foreground mt-1">all-in, including unbudgeted</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <p className="text-xs text-muted-foreground">Total Budgeted</p>
          <p className="text-2xl font-bold tracking-tight mt-1">{formatCurrency(totalBudgeted)}</p>
          <p className="text-[11px] text-muted-foreground mt-1">across {overview.length} budget{overview.length === 1 ? "" : "s"}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-baseline justify-between mb-1">
            <p className="text-xs text-muted-foreground">Coverage</p>
            <p className="text-xs font-medium tabular-nums">{coveragePct}%</p>
          </div>
          <p className="text-2xl font-bold tracking-tight">{formatCurrency(totalSpentInBudgeted)}</p>
          <Progress value={coveragePct} className="h-1.5 mt-2" />
          <p className="text-[11px] text-muted-foreground mt-1">
            of trailing-30 spend lives in a budgeted category
          </p>
        </CardContent>
      </Card>

      <Card className={blownCount > 0 ? "border-red-300 dark:border-red-900" : undefined}>
        <CardContent className="pt-5">
          <p className="text-xs text-muted-foreground">Honored / Blown</p>
          <p className="text-2xl font-bold tracking-tight mt-1 tabular-nums">
            <span className="text-emerald-600">{honoredCount}</span>
            <span className="text-muted-foreground mx-1">/</span>
            <span className={blownCount > 0 ? "text-red-500" : "text-muted-foreground"}>{blownCount}</span>
          </p>
          {blownOverage > 0 && (
            <p className="text-[11px] text-red-500 mt-1">
              {formatCurrency(blownOverage)} over across {blownCount} budget{blownCount === 1 ? "" : "s"}
            </p>
          )}
          {blownCount === 0 && overview.length > 0 && (
            <p className="text-[11px] text-emerald-600 mt-1">all budgets on track</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

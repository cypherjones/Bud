import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/utils/format";
import { Utensils, AlertTriangle, CheckCircle2, TrendingUp } from "lucide-react";
import type { CategoryDailyPace } from "@/lib/actions/budget";

type Props = {
  pace: CategoryDailyPace;
};

/** Single-category daily-pace card. Shows today, MTD, projection, and pace
 *  status against the budget. Designed for "the discipline category" — the
 *  user picks one (Restaurants) and tracks daily to actually hit the budget. */
export function CategoryPaceTracker({ pace }: Props) {
  const overBudget = pace.mtdCents > pace.budgetCents;
  const projectedOver = pace.projectedMonthCents > pace.budgetCents;

  const barColor = pace.status === "over" ? "[&>div]:bg-red-500" : pace.status === "warn" ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500";
  const statusBorder = pace.status === "over" ? "border-red-300 dark:border-red-900" : pace.status === "warn" ? "border-amber-300 dark:border-amber-800" : "border-emerald-200 dark:border-emerald-800";
  const statusBg = pace.status === "over" ? "bg-red-50/30 dark:bg-red-950/10" : pace.status === "warn" ? "bg-amber-50/30 dark:bg-amber-950/10" : "bg-emerald-50/30 dark:bg-emerald-950/10";

  const StatusIcon = pace.status === "over" ? AlertTriangle : pace.status === "warn" ? TrendingUp : CheckCircle2;
  const statusColor = pace.status === "over" ? "text-red-600" : pace.status === "warn" ? "text-amber-600" : "text-emerald-600";

  const headline =
    pace.budgetCents === 0
      ? "No budget set"
      : pace.status === "over"
        ? `Already over budget by ${formatCurrency(pace.mtdCents - pace.budgetCents)}`
        : pace.status === "warn"
          ? `Pacing ${pace.paceVsBudgetPercent}% — projected ${formatCurrency(pace.projectedMonthCents)} EOM`
          : `On pace · ${formatCurrency(pace.budgetCents - pace.mtdCents)} left for ${pace.daysInMonth - pace.daysElapsed} more days`;

  return (
    <Card className={`${statusBorder} ${statusBg}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Utensils className="w-4 h-4 text-muted-foreground" />
            {pace.categoryName} pace · day {pace.daysElapsed} of {pace.daysInMonth}
          </CardTitle>
          <div className={`flex items-center gap-1.5 ${statusColor} text-xs font-medium`}>
            <StatusIcon className="w-3.5 h-3.5" />
            {headline}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* MTD bar */}
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs text-muted-foreground">MTD spend</span>
            <span className="text-sm font-semibold tabular-nums">
              <span className={overBudget ? "text-red-500" : ""}>{formatCurrency(pace.mtdCents)}</span>
              <span className="text-muted-foreground"> / {formatCurrency(pace.budgetCents)}</span>
            </span>
          </div>
          <Progress
            value={pace.budgetCents > 0 ? Math.min(100, (pace.mtdCents / pace.budgetCents) * 100) : 0}
            className={`h-2 ${barColor}`}
          />
          <p className="text-[11px] text-muted-foreground mt-1.5">
            On linear pace, you&apos;d be at {formatCurrency(Math.round((pace.budgetCents / pace.daysInMonth) * pace.daysElapsed))} by today.
            You&apos;re at {pace.paceVsBudgetPercent}% of that.
          </p>
        </div>

        {/* Mini metric row */}
        <div className="grid grid-cols-4 gap-3 pt-2 border-t border-border">
          <Metric label="Today" value={formatCurrency(pace.todayCents)} />
          <Metric label="Yesterday" value={formatCurrency(pace.yesterdayCents)} />
          <Metric
            label="Projected EOM"
            value={formatCurrency(pace.projectedMonthCents)}
            tone={projectedOver ? "red" : undefined}
          />
          <Metric
            label="Days left in budget"
            value={
              pace.daysOfBudgetLeft === null
                ? "—"
                : pace.daysOfBudgetLeft === 0
                  ? "0 (over)"
                  : `${pace.daysOfBudgetLeft}d`
            }
            tone={pace.daysOfBudgetLeft !== null && pace.daysOfBudgetLeft < pace.daysInMonth - pace.daysElapsed ? "red" : undefined}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "red" }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-medium tabular-nums mt-0.5 ${tone === "red" ? "text-red-500" : ""}`}>{value}</p>
    </div>
  );
}

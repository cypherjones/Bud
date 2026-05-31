import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import { Wallet, TrendingDown, ArrowDown, AlertTriangle } from "lucide-react";
import type { BudgetStrategy } from "@/lib/actions/budget";

type Props = {
  strategy: BudgetStrategy;
};

/** "You are here" pulse — the everyday-clarity widget standard apps nail and
 *  this app was missing. Three plain-language sentences, no jargon, no buckets.
 *  Surfaces the next-7-day trough (the cash crunch BEFORE next paycheck) and
 *  flags survival-floor breaches loudly. EOM peaks lie; the trough doesn't. */
export function TodayPulse({ strategy }: Props) {
  const { next7DayTrough, nextIncomeEvent, survivalFloorCents, troughBreachesFloor } = strategy;

  const today = formatCurrency(strategy.todayBalanceCents);

  // Days until trough / income, computed from local date math (server-rendered
  // so this is whatever "today" is on the server's clock).
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  const daysFromToday = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    return Math.round((d.getTime() - todayDate.getTime()) / 86400000);
  };
  const shortDate = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  // Trough = lowest projected balance in next 7 days. If the trough is "today"
  // (no projected dip lower than current balance), suppress that sentence so
  // we don't say "trough today $1,535" — adds noise, removes signal.
  const showTrough = next7DayTrough !== null && next7DayTrough.balanceCents < strategy.todayBalanceCents;
  const troughDays = next7DayTrough ? daysFromToday(next7DayTrough.date) : null;
  const incomeDays = nextIncomeEvent ? daysFromToday(nextIncomeEvent.date) : null;

  return (
    <Card className={troughBreachesFloor ? "border-red-400 dark:border-red-800 bg-red-50/40 dark:bg-red-950/20" : "border-border"}>
      <CardContent className="py-3 px-4">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="shrink-0 pt-0.5">
            {troughBreachesFloor
              ? <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
              : <Wallet className="w-4 h-4 text-muted-foreground" />}
          </div>
          <div className="flex-1 min-w-0 space-y-0.5">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              You are here
            </p>
            <div className="flex items-baseline gap-1.5 flex-wrap text-sm">
              <span className="font-semibold tabular-nums">Today {today}</span>
              {showTrough && next7DayTrough && troughDays !== null && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className={`tabular-nums ${troughBreachesFloor ? "text-red-600 dark:text-red-400 font-semibold" : "text-muted-foreground"}`}>
                    <TrendingDown className="w-3 h-3 inline mr-0.5 -mt-0.5" />
                    Low {formatCurrency(next7DayTrough.balanceCents)} on {shortDate(next7DayTrough.date)}
                    {troughDays > 0 && <span className="text-muted-foreground/70"> ({troughDays}d)</span>}
                  </span>
                </>
              )}
              {nextIncomeEvent && incomeDays !== null && incomeDays >= 0 && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-emerald-700 dark:text-emerald-400 tabular-nums">
                    <ArrowDown className="w-3 h-3 inline mr-0.5 -mt-0.5" />
                    Next +{formatCurrency(nextIncomeEvent.amountCents)} {shortDate(nextIncomeEvent.date)}
                    {incomeDays > 0 && <span className="text-muted-foreground/70"> ({incomeDays}d)</span>}
                  </span>
                </>
              )}
            </div>
            {troughBreachesFloor && next7DayTrough && (
              <p className="text-[11px] text-red-700 dark:text-red-300 mt-1">
                Trough drops below survival floor ({formatCurrency(survivalFloorCents)}). An unexpected expense before {shortDate(next7DayTrough.date)} could miss an obligation.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

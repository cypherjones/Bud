import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import { AlertOctagon, Clock } from "lucide-react";

type Deadline = {
  debtId: string;
  creditorName: string;
  deadline: string; // YYYY-MM-DD
  amount: number;
  note: string | null;
  daysAway: number;
};

type Props = {
  deadlines: Deadline[];
};

function shortDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function DebtDeadlineBanner({ deadlines }: Props) {
  if (deadlines.length === 0) return null;

  // Past-due gets a darker red treatment; <=7 days = amber; otherwise normal.
  const worst = deadlines[0];
  const isPastDue = worst.daysAway < 0;
  const tone = isPastDue
    ? "border-red-400 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
    : worst.daysAway <= 7
      ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
      : "border-blue-300 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30";
  const Icon = isPastDue ? AlertOctagon : Clock;
  const iconColor = isPastDue
    ? "text-red-600 dark:text-red-400"
    : worst.daysAway <= 7
      ? "text-amber-600 dark:text-amber-400"
      : "text-blue-600 dark:text-blue-400";

  return (
    <Card className={tone}>
      <CardContent className="py-3 px-4 space-y-2">
        {deadlines.map((d, i) => {
          const dayLabel =
            d.daysAway < 0
              ? `${Math.abs(d.daysAway)} ${Math.abs(d.daysAway) === 1 ? "day" : "days"} past due`
              : d.daysAway === 0
                ? "today"
                : `in ${d.daysAway} ${d.daysAway === 1 ? "day" : "days"}`;
          return (
            <div key={d.debtId} className="flex items-start gap-3 text-sm">
              {i === 0 ? (
                <Icon className={`w-4 h-4 ${iconColor} shrink-0 mt-0.5`} />
              ) : (
                <span className="w-4 h-4 shrink-0" />
              )}
              <div className="flex-1">
                <span className="font-medium">{d.creditorName}: </span>
                <span>
                  pay <span className="font-medium">{formatCurrency(d.amount)}</span> by{" "}
                  <span className="font-medium">{shortDate(d.deadline)}</span> ({dayLabel})
                </span>
                {d.note && (
                  <p className="text-xs text-muted-foreground mt-0.5">{d.note}</p>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

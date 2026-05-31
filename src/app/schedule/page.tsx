import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { formatCurrency } from "@/lib/utils/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getUpcomingRecurringEvents,
  monthlizeRecurring,
  type RecurringEvent,
} from "@/lib/actions/dashboard";
import { getCashFlowForecast } from "@/lib/actions/reports";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  // === Active recurring rows (for monthly totals) ===
  // We need the full set to compute monthlized income/bills regardless of when
  // the next occurrence falls; getUpcomingRecurringEvents only emits events
  // inside the window.
  const recurring = await db
    .select({
      id: schema.recurringTransactions.id,
      amount: schema.recurringTransactions.amount,
      frequency: schema.recurringTransactions.frequency,
      groupName: schema.categoryGroups.name,
    })
    .from(schema.recurringTransactions)
    .leftJoin(schema.categories, eq(schema.recurringTransactions.categoryId, schema.categories.id))
    .leftJoin(schema.categoryGroups, eq(schema.categories.groupId, schema.categoryGroups.id))
    .where(eq(schema.recurringTransactions.isActive, true))
    .all();

  // Group-based income classification. Avoids the prior "Paycheck/Income/Cash Advance"
  // name-string match, which silently mislabeled income that lived under a
  // non-matching category name.
  let totalMonthlyIncome = 0;
  let totalMonthlyExpenses = 0;
  for (const r of recurring) {
    if (r.groupName === "Internal") continue; // transfers / round-ups aren't real flow
    const monthly = monthlizeRecurring(r.amount, r.frequency);
    if (r.groupName === "Income") totalMonthlyIncome += monthly;
    else totalMonthlyExpenses += monthly;
  }
  const netMonthly = totalMonthlyIncome - totalMonthlyExpenses;

  // === Per-occurrence events for the calendar + timeline ===
  // Same frequency math as getCashFlowForecast (weekly/biweekly/monthly/yearly
  // all handled), so a biweekly due on the 20th correctly hits the 3rd of next
  // month, not the bogus "6th of this month" the old code produced.
  const events = getUpcomingRecurringEvents(30);

  // === Calendar grid for the current month ===
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const daysInMonth = monthEnd.getDate();
  const startDow = monthStart.getDay();

  type DayCell = { day: number | null; income: number; expense: number; items: string[] };
  const eventsByDate = new Map<string, RecurringEvent[]>();
  for (const ev of events) {
    if (!eventsByDate.has(ev.dueDate)) eventsByDate.set(ev.dueDate, []);
    eventsByDate.get(ev.dueDate)!.push(ev);
  }

  const calendarDays: DayCell[] = [];
  for (let i = 0; i < startDow; i++) calendarDays.push({ day: null, income: 0, expense: 0, items: [] });
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayEvents = eventsByDate.get(iso) ?? [];
    const income = dayEvents.filter((e) => e.kind === "income").reduce((s, e) => s + e.amount, 0);
    const expense = dayEvents.filter((e) => e.kind === "expense").reduce((s, e) => s + e.amount, 0);
    calendarDays.push({
      day: d,
      income,
      expense,
      items: dayEvents.map((e) => e.merchant),
    });
  }

  // === Next-30-days timeline (grouped by date) ===
  const timeline: { date: string; dayLabel: string; items: RecurringEvent[] }[] = [];
  for (const ev of events) {
    const last = timeline[timeline.length - 1];
    if (last && last.date === ev.dueDate) {
      last.items.push(ev);
    } else {
      const d = new Date(ev.dueDate + "T00:00:00");
      const dayLabel = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const isToday = ev.daysUntil === 0;
      timeline.push({
        date: ev.dueDate,
        dayLabel: isToday ? `Today — ${dayLabel}` : dayLabel,
        items: [ev],
      });
    }
  }

  // === Projected cash flow — real accounting, not just recurring ===
  // Pulls today's depository balance, walks scheduled bills + paychecks +
  // variable-daily-rate burn through the window. Replaces the page's old
  // hand-rolled "running net" that only summed recurring rows.
  const cashFlow = getCashFlowForecast(30);
  const projectedDays = cashFlow.data.filter((d) => d.isProjected);

  const monthLabel = today.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="flex flex-col h-screen">
      <header className="px-8 py-6 border-b border-border bg-card/50">
        <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>
        <p className="text-sm text-muted-foreground">
          Upcoming bills, income, and projected cash flow
        </p>
      </header>

      <div className="flex-1 overflow-auto p-8 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">Monthly Income</p>
              <p className="text-2xl font-bold tracking-tight mt-1 text-emerald-600">
                +{formatCurrency(totalMonthlyIncome)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">recurring, monthlized</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">Monthly Bills</p>
              <p className="text-2xl font-bold tracking-tight mt-1 text-red-500">
                -{formatCurrency(totalMonthlyExpenses)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">recurring, monthlized</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">Net After Bills</p>
              <p className={`text-2xl font-bold tracking-tight mt-1 ${netMonthly >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {netMonthly >= 0 ? "+" : ""}{formatCurrency(netMonthly)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                excludes variable spending — see projection below
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Calendar Grid */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">{monthLabel}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-px">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">
                    {d}
                  </div>
                ))}
                {calendarDays.map((d, i) => {
                  const isToday = d.day === today.getDate();
                  const hasItems = d.income > 0 || d.expense > 0;
                  return (
                    <div
                      key={i}
                      className={`relative min-h-[52px] p-1 rounded text-xs border ${
                        isToday
                          ? "border-primary bg-primary/5"
                          : hasItems
                            ? "border-border"
                            : "border-transparent"
                      }`}
                      title={d.items.join(", ")}
                    >
                      {d.day && (
                        <>
                          <span className={`${isToday ? "font-bold text-primary" : "text-muted-foreground"}`}>
                            {d.day}
                          </span>
                          {d.income > 0 && (
                            <div className="text-[9px] text-emerald-600 font-medium truncate">
                              +{formatCurrency(d.income)}
                            </div>
                          )}
                          {d.expense > 0 && (
                            <div className="text-[9px] text-red-500 font-medium truncate">
                              -{formatCurrency(d.expense)}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Next 30 Days</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No upcoming bills scheduled
                </p>
              ) : (
                timeline.map((day) => (
                  <div key={day.date}>
                    <p className="text-xs font-semibold text-muted-foreground mb-1.5">
                      {day.dayLabel}
                    </p>
                    <div className="space-y-1.5">
                      {day.items.map((item) => {
                        const isIncome = item.kind === "income";
                        return (
                          <div
                            key={item.id}
                            className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-accent/30"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: item.categoryColor ?? (isIncome ? "#15803d" : "#e11d48") }}
                              />
                              <span className="text-sm">{item.merchant}</span>
                            </div>
                            <span className={`text-sm font-medium ${isIncome ? "text-emerald-600" : ""}`}>
                              {isIncome ? "+" : "-"}{formatCurrency(item.amount)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Projected Cash Flow — sourced from getCashFlowForecast, not a
            hand-rolled net. Reflects real balance walking through scheduled
            bills + paychecks + capped variable burn. */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Projected Balance — Next 30 Days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 text-xs text-muted-foreground space-y-0.5">
              <p>
                Starts at <span className="font-medium">{formatCurrency(cashFlow.startingBalance)}</span> (cash & savings today).
                Includes a daily variable-burn rate of <span className="font-medium">{formatCurrency(cashFlow.variableDailyRate)}</span> for groceries/gas/restaurants/health/etc.
              </p>
              {cashFlow.breachesFloor && cashFlow.lowestProjected && (
                <p className="text-red-500 font-medium">
                  ⚠ Dips below survival floor ({formatCurrency(cashFlow.survivalFloor)}) on{" "}
                  {new Date(cashFlow.lowestProjected.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}.
                </p>
              )}
            </div>
            <div className="space-y-1">
              {projectedDays.map((day) => {
                const dayNet = day.income - day.expenses;
                const d = new Date(day.date + "T00:00:00");
                const dayLabel = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                const balanceWidth = Math.min(
                  Math.abs(day.projectedBalance) / Math.max(cashFlow.startingBalance, 1) * 100,
                  100,
                );
                return (
                  <div key={day.date} className="flex items-center gap-4 py-1 text-xs">
                    <span className="w-28 text-muted-foreground">{dayLabel}</span>
                    <span className={`w-24 text-right font-medium ${dayNet >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {dayNet >= 0 ? "+" : ""}{formatCurrency(dayNet)}
                    </span>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${day.projectedBalance >= 0 ? "bg-emerald-500" : "bg-red-500"}`}
                        style={{ width: `${balanceWidth}%` }}
                      />
                    </div>
                    <span className={`w-24 text-right ${day.projectedBalance >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {day.projectedBalance >= 0 ? "+" : ""}{formatCurrency(day.projectedBalance)}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

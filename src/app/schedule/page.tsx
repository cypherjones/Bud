import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { formatCurrency } from "@/lib/utils/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const recurring = await db
    .select({
      id: schema.recurringTransactions.id,
      merchant: schema.recurringTransactions.merchant,
      amount: schema.recurringTransactions.amount,
      frequency: schema.recurringTransactions.frequency,
      nextDueDate: schema.recurringTransactions.nextDueDate,
      categoryName: schema.categories.name,
      categoryColor: schema.categories.color,
    })
    .from(schema.recurringTransactions)
    .leftJoin(schema.categories, eq(schema.recurringTransactions.categoryId, schema.categories.id))
    .where(eq(schema.recurringTransactions.isActive, true))
    .all();

  // Separate income vs expenses
  const incomeCategories = new Set(["Paycheck", "Income", "Cash Advance"]);
  const incomeBills = recurring.filter((r) => incomeCategories.has(r.categoryName ?? ""));
  const expenseBills = recurring.filter((r) => !incomeCategories.has(r.categoryName ?? ""));

  // Build next 30 days of scheduled events
  const today = new Date();
  const schedule: { date: string; dayLabel: string; items: typeof recurring }[] = [];

  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const dayOfMonth = d.getDate();

    const dayItems = recurring.filter((r) => {
      if (!r.nextDueDate) return false;
      const dueDay = new Date(r.nextDueDate + "T00:00:00").getDate();
      // Match if this day-of-month equals the due day
      // For biweekly, also show 15 days later
      if (r.frequency === "biweekly") {
        return dayOfMonth === dueDay || dayOfMonth === ((dueDay + 14) % 28 || 28);
      }
      return dayOfMonth === dueDay;
    });

    if (dayItems.length > 0) {
      const dayLabel = d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      const isToday = i === 0;
      schedule.push({
        date: dateStr,
        dayLabel: isToday ? `Today — ${dayLabel}` : dayLabel,
        items: dayItems,
      });
    }
  }

  // Monthly totals
  const totalMonthlyIncome = incomeBills.reduce((s, r) => {
    if (r.frequency === "biweekly") return s + r.amount * 2;
    return s + r.amount;
  }, 0);
  const totalMonthlyExpenses = expenseBills.reduce((s, r) => s + r.amount, 0);
  const netMonthly = totalMonthlyIncome - totalMonthlyExpenses;

  // Build calendar grid for current month
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const daysInMonth = monthEnd.getDate();
  const startDow = monthStart.getDay();

  const calendarDays: { day: number | null; income: number; expense: number; items: string[] }[] = [];
  // Pad start
  for (let i = 0; i < startDow; i++) calendarDays.push({ day: null, income: 0, expense: 0, items: [] });

  for (let d = 1; d <= daysInMonth; d++) {
    const dayItems = recurring.filter((r) => {
      if (!r.nextDueDate) return false;
      const dueDay = new Date(r.nextDueDate + "T00:00:00").getDate();
      if (r.frequency === "biweekly") {
        return d === dueDay || d === ((dueDay + 14) % 28 || 28);
      }
      return d === dueDay;
    });

    const income = dayItems
      .filter((r) => incomeCategories.has(r.categoryName ?? ""))
      .reduce((s, r) => s + r.amount, 0);
    const expense = dayItems
      .filter((r) => !incomeCategories.has(r.categoryName ?? ""))
      .reduce((s, r) => s + r.amount, 0);

    calendarDays.push({
      day: d,
      income,
      expense,
      items: dayItems.map((r) => r.merchant),
    });
  }

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
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">Monthly Bills</p>
              <p className="text-2xl font-bold tracking-tight mt-1 text-red-500">
                -{formatCurrency(totalMonthlyExpenses)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">Net After Bills</p>
              <p className={`text-2xl font-bold tracking-tight mt-1 ${netMonthly >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {netMonthly >= 0 ? "+" : ""}{formatCurrency(netMonthly)}
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
              {schedule.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No upcoming bills scheduled
                </p>
              ) : (
                schedule.map((day) => (
                  <div key={day.date}>
                    <p className="text-xs font-semibold text-muted-foreground mb-1.5">
                      {day.dayLabel}
                    </p>
                    <div className="space-y-1.5">
                      {day.items.map((item, i) => {
                        const isIncome = incomeCategories.has(item.categoryName ?? "");
                        return (
                          <div
                            key={i}
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

        {/* Running Balance Projection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Projected Cash Flow — Day by Day</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {(() => {
                let runningNet = 0;
                return schedule.map((day) => {
                  const dayIncome = day.items
                    .filter((r) => incomeCategories.has(r.categoryName ?? ""))
                    .reduce((s, r) => s + r.amount, 0);
                  const dayExpense = day.items
                    .filter((r) => !incomeCategories.has(r.categoryName ?? ""))
                    .reduce((s, r) => s + r.amount, 0);
                  const dayNet = dayIncome - dayExpense;
                  runningNet += dayNet;

                  return (
                    <div key={day.date} className="flex items-center gap-4 py-1 text-xs">
                      <span className="w-24 text-muted-foreground">{day.dayLabel}</span>
                      <span className={`w-24 text-right font-medium ${dayNet >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {dayNet >= 0 ? "+" : ""}{formatCurrency(dayNet)}
                      </span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${runningNet >= 0 ? "bg-emerald-500" : "bg-red-500"}`}
                          style={{
                            width: `${Math.min(Math.abs(runningNet) / (totalMonthlyIncome || 1) * 100, 100)}%`,
                          }}
                        />
                      </div>
                      <span className={`w-24 text-right ${runningNet >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {runningNet >= 0 ? "+" : ""}{formatCurrency(runningNet)}
                      </span>
                    </div>
                  );
                });
              })()}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

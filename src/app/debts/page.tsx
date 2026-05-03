import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { formatCurrency } from "@/lib/utils/format";
import { calculateDebtAllocation } from "@/lib/utils/debt-engine";
import { getMonthlyAllocationVsActual, getPayoffProjections } from "@/lib/actions/debts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { LogPaymentDialog } from "@/components/debts/log-payment-dialog";
import { AddTaxObligationDialog } from "@/components/debts/add-tax-obligation-dialog";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  credit_card: "Credit Card",
  personal_loan: "Personal Loan",
  student_loan: "Student Loan",
  auto_loan: "Auto Loan",
  medical: "Medical",
  tax_debt: "Tax Debt",
  other: "Other",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  paid_off: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  in_collections: "bg-red-500/15 text-red-400 border-red-500/30",
  deferred: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

export default function DebtsPage() {
  const allDebts = db.select().from(schema.debts).all();
  const activeDebts = allDebts.filter((d) => d.status === "active");
  const paidDebts = allDebts.filter((d) => d.status === "paid_off");

  // Empty state
  if (allDebts.length === 0) {
    return (
      <div className="flex flex-col h-screen">
        <header className="px-8 py-6 border-b border-border bg-card/50 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Debt Payoff</h1>
            <p className="text-sm text-muted-foreground">
              Smart allocation and payoff tracking
            </p>
          </div>
          <AddTaxObligationDialog />
        </header>
        <div className="flex-1 overflow-auto p-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your Debts</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground text-center py-8">
                No debts tracked yet. Tell Bud about your debts to get started.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Compute summary values
  const totalDebt = allDebts.reduce((s, d) => s + d.currentBalance, 0);
  const totalOriginal = allDebts.reduce((s, d) => s + d.originalBalance, 0);
  const totalPaidOff = totalOriginal - totalDebt;
  const totalMinimums = activeDebts.reduce((s, d) => s + d.minimumPayment, 0);
  const overallProgress =
    totalOriginal > 0 ? Math.round((totalPaidOff / totalOriginal) * 100) : 0;

  // Smart allocation (use sum of minimums as budget baseline)
  const movePlan = db
    .select()
    .from(schema.financialPlans)
    .where(eq(schema.financialPlans.type, "move"))
    .get();

  const allocation =
    activeDebts.length > 0
      ? calculateDebtAllocation(
          activeDebts,
          totalMinimums,
          movePlan
            ? {
                targetAmount: movePlan.targetAmount,
                currentSaved: movePlan.currentSaved,
                targetDate: movePlan.targetDate,
              }
            : undefined
        )
      : null;

  // This-month recommended vs. actual paid (per debt + aggregate). Snaps the
  // allocation row into debtAllocations on first load of a new month.
  const monthVsActual = getMonthlyAllocationVsActual();
  const vsActualByDebt = new Map(monthVsActual.rows.map((r) => [r.debtId, r]));

  // Per-debt and aggregate payoff projections.
  const payoffProjections = getPayoffProjections();
  const payoffByDebt = new Map(payoffProjections.rows.map((p) => [p.debtId, p]));

  return (
    <div className="flex flex-col h-screen">
      <header className="px-8 py-6 border-b border-border bg-card/50 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Debt Payoff</h1>
          <p className="text-sm text-muted-foreground">
            Smart allocation and payoff tracking
          </p>
        </div>
        <AddTaxObligationDialog />
      </header>

      <div className="flex-1 overflow-auto p-8 space-y-8">
        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Debt
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-400">
                {formatCurrency(totalDebt)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                across {activeDebts.length} active{" "}
                {activeDebts.length === 1 ? "debt" : "debts"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Paid Off
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-emerald-400">
                {formatCurrency(totalPaidOff)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                of {formatCurrency(totalOriginal)} original
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Monthly Minimums
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-amber-400">
                {formatCurrency(totalMinimums)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                due each month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Overall Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-purple-400">
                {overallProgress}%
              </p>
              <Progress value={overallProgress} className="mt-2 h-2" />
            </CardContent>
          </Card>
        </div>

        <DebtFreeProjection projection={payoffProjections} />

        {/* Active debts */}
        {activeDebts.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Active Debts</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {activeDebts.map((debt) => {
                const payoffPct =
                  debt.originalBalance > 0
                    ? Math.round(
                        ((debt.originalBalance - debt.currentBalance) /
                          debt.originalBalance) *
                          100
                      )
                    : 0;

                const utilization =
                  debt.type === "credit_card" && debt.creditLimit
                    ? Math.round(
                        (debt.currentBalance / debt.creditLimit) * 100
                      )
                    : null;

                const monthRow = vsActualByDebt.get(debt.id);
                const payoff = payoffByDebt.get(debt.id);

                return (
                  <Card key={debt.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base">
                          {debt.creditorName}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={STATUS_COLORS[debt.status] ?? ""}
                          >
                            {debt.status.replace("_", " ")}
                          </Badge>
                          <Badge variant="secondary">
                            {TYPE_LABELS[debt.type] ?? debt.type}
                          </Badge>
                          <LogPaymentDialog
                            debtId={debt.id}
                            creditorName={debt.creditorName}
                            minimumPayment={debt.minimumPayment}
                          />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Balance</span>
                          <p className="font-semibold">
                            {formatCurrency(debt.currentBalance)}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            Original
                          </span>
                          <p className="font-semibold">
                            {formatCurrency(debt.originalBalance)}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">APR</span>
                          <p className="font-semibold">
                            {(debt.interestRate * 100).toFixed(2)}%
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            Min Payment
                          </span>
                          <p className="font-semibold">
                            {formatCurrency(debt.minimumPayment)}
                          </p>
                        </div>
                        {utilization !== null && (
                          <div className="col-span-2">
                            <span className="text-muted-foreground">
                              Utilization
                            </span>
                            <p
                              className={`font-semibold ${
                                utilization > 30
                                  ? "text-red-400"
                                  : utilization > 10
                                    ? "text-amber-400"
                                    : "text-emerald-400"
                              }`}
                            >
                              {utilization}% of{" "}
                              {formatCurrency(debt.creditLimit!)} limit
                            </p>
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Payoff progress</span>
                          <span>{payoffPct}%</span>
                        </div>
                        <Progress value={payoffPct} className="h-2" />
                      </div>

                      {monthRow && monthRow.recommended > 0 && (
                        <MonthVsActualStrip row={monthRow} />
                      )}

                      {payoff && <PayoffProjection projection={payoff} />}

                      {debt.nextActionDeadline && debt.nextActionAmount !== null && (
                        <NextActionStrip
                          deadline={debt.nextActionDeadline}
                          amount={debt.nextActionAmount}
                          note={debt.nextActionNote}
                        />
                      )}

                      {debt.dueDay && (
                        <p className="text-xs text-muted-foreground">
                          Due on the {ordinal(debt.dueDay)} of each month
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Smart allocation */}
        {allocation && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">
              Smart Allocation — {allocation.month}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">
                    Monthly Budget
                  </p>
                  <p className="text-xl font-bold">
                    {allocation.total_budget}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">
                    Total Minimums
                  </p>
                  <p className="text-xl font-bold">
                    {allocation.total_minimums}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">
                    Available Surplus
                  </p>
                  <p className="text-xl font-bold text-emerald-400">
                    {allocation.surplus}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Monthly Allocation Plan
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {allocation.allocations.map((alloc, i) => (
                  <div key={alloc.creditor}>
                    {i > 0 && <Separator className="mb-4" />}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">
                            {alloc.creditor}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {TYPE_LABELS[alloc.type] ?? alloc.type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Priority: {alloc.priority_score}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Balance: {alloc.balance}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {alloc.breakdown}
                        </p>
                        <p className="text-sm text-purple-400/80 italic">
                          {alloc.reasoning}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-amber-400">
                          {alloc.payment}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {allocation.projected_impact && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Projected Impact</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {allocation.projected_impact}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Paid off debts */}
        {paidDebts.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Paid Off</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {paidDebts.map((debt) => (
                <Card key={debt.id} className="opacity-75">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        {debt.creditorName}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={STATUS_COLORS.paid_off}
                        >
                          paid off
                        </Badge>
                        <Badge variant="secondary">
                          {TYPE_LABELS[debt.type] ?? debt.type}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">
                          Original Balance
                        </span>
                        <p className="font-semibold line-through text-muted-foreground">
                          {formatCurrency(debt.originalBalance)}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">APR</span>
                        <p className="font-semibold text-muted-foreground">
                          {(debt.interestRate * 100).toFixed(2)}%
                        </p>
                      </div>
                    </div>
                    <Progress value={100} className="mt-4 h-2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Simple ordinal suffix: 1st, 2nd, 3rd, 4th, ... */
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function MonthVsActualStrip({
  row,
}: {
  row: {
    recommended: number;
    actualPaid: number;
    paymentCount: number;
    status: "ahead" | "on_track" | "behind" | "no_plan";
  };
}) {
  if (row.status === "no_plan") return null;

  const pct = row.recommended > 0
    ? Math.min(150, Math.round((row.actualPaid / row.recommended) * 100))
    : 0;
  const barWidth = Math.min(100, pct);

  const statusLabel =
    row.status === "ahead" ? "ahead of plan"
    : row.status === "on_track" ? "on track"
    : "behind plan";
  const statusColor =
    row.status === "ahead" ? "text-emerald-400"
    : row.status === "on_track" ? "text-amber-400"
    : "text-red-400";
  const barColor =
    row.status === "ahead" ? "bg-emerald-500"
    : row.status === "on_track" ? "bg-amber-500"
    : "bg-red-500";

  return (
    <div className="rounded-md bg-muted/40 px-3 py-2 text-xs space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">This month</span>
        <span className={`font-medium ${statusColor}`}>{pct}% · {statusLabel}</span>
      </div>
      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${barColor}`} style={{ width: `${barWidth}%` }} />
      </div>
      <div className="flex items-center justify-between text-muted-foreground">
        <span>
          {formatCurrency(row.actualPaid)} paid
          {row.paymentCount > 0 ? ` · ${row.paymentCount} ${row.paymentCount === 1 ? "payment" : "payments"}` : ""}
        </span>
        <span>of {formatCurrency(row.recommended)} recommended</span>
      </div>
    </div>
  );
}

function formatPayoffDate(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function PayoffProjection({
  projection,
}: {
  projection: {
    monthsAtMinimum: number | null;
    payoffAtMinimum: string | null;
    monthsAtRecommended: number | null;
    payoffAtRecommended: string | null;
    recommendedPayment: number;
    currentBalance: number;
  };
}) {
  if (projection.monthsAtMinimum === null && projection.monthsAtRecommended === null) {
    return (
      <div className="rounded-md border border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">
        Minimum payment doesn&apos;t cover monthly interest — balance grows over time.
      </div>
    );
  }

  const minLabel =
    projection.monthsAtMinimum !== null && projection.payoffAtMinimum
      ? `${projection.monthsAtMinimum} mo (${formatPayoffDate(projection.payoffAtMinimum)})`
      : "—";

  const showRec =
    projection.monthsAtRecommended !== null &&
    projection.payoffAtRecommended &&
    projection.monthsAtRecommended !== projection.monthsAtMinimum;

  return (
    <div className="rounded-md bg-muted/40 px-3 py-2 text-xs flex items-center justify-between">
      <span className="text-muted-foreground">Payoff at min</span>
      <span className="font-medium">{minLabel}</span>
      {showRec && (
        <>
          <span className="text-muted-foreground ml-3">at recommended</span>
          <span className="font-medium text-emerald-500">
            {projection.monthsAtRecommended} mo ({formatPayoffDate(projection.payoffAtRecommended!)})
          </span>
        </>
      )}
    </div>
  );
}

function NextActionStrip({
  deadline,
  amount,
  note,
}: {
  deadline: string;
  amount: number;
  note: string | null;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(deadline + "T00:00:00");
  const daysAway = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  const isPastDue = daysAway < 0;
  const tone = isPastDue
    ? "border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30"
    : daysAway <= 7
      ? "border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30"
      : "border-blue-300 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/30";
  const dayLabel = isPastDue
    ? `${Math.abs(daysAway)} ${Math.abs(daysAway) === 1 ? "day" : "days"} past due`
    : daysAway === 0
      ? "today"
      : `in ${daysAway} ${daysAway === 1 ? "day" : "days"}`;
  return (
    <div className={`rounded-md border px-3 py-2 text-xs space-y-1 ${tone}`}>
      <div className="flex items-center justify-between">
        <span className="font-medium">Next action</span>
        <span className="font-medium">
          {formatCurrency(amount)} by{" "}
          {new Date(deadline + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
          ({dayLabel})
        </span>
      </div>
      {note && <p className="text-muted-foreground">{note}</p>}
    </div>
  );
}

function DebtFreeProjection({
  projection,
}: {
  projection: {
    debtFreeMonthsAtMinimum: number | null;
    debtFreeAtMinimum: string | null;
    debtFreeMonthsAtRecommended: number | null;
    debtFreeAtRecommended: string | null;
  };
}) {
  if (
    projection.debtFreeAtMinimum === null &&
    projection.debtFreeAtRecommended === null
  ) {
    return null;
  }

  const minLabel =
    projection.debtFreeAtMinimum && projection.debtFreeMonthsAtMinimum !== null
      ? `${formatPayoffDate(projection.debtFreeAtMinimum)} (${projection.debtFreeMonthsAtMinimum} months)`
      : "—";

  const showRec =
    projection.debtFreeAtRecommended &&
    projection.debtFreeMonthsAtRecommended !== null &&
    projection.debtFreeMonthsAtRecommended !== projection.debtFreeMonthsAtMinimum;

  return (
    <Card className="border-purple-200 dark:border-purple-900 bg-purple-50/40 dark:bg-purple-950/20">
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Debt-free at minimums</p>
            <p className="font-semibold">{minLabel}</p>
          </div>
          {showRec && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">At smart-allocation pace</p>
              <p className="font-semibold text-emerald-500">
                {formatPayoffDate(projection.debtFreeAtRecommended!)}
                {" · "}
                {projection.debtFreeMonthsAtRecommended} months
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

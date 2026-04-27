import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { formatCurrency } from "@/lib/utils/format";
import { calculateDebtAllocation } from "@/lib/utils/debt-engine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

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
        <header className="px-8 py-6 border-b border-border bg-card/50">
          <h1 className="text-2xl font-bold tracking-tight">Debt Payoff</h1>
          <p className="text-sm text-muted-foreground">
            Smart allocation and payoff tracking
          </p>
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

  return (
    <div className="flex flex-col h-screen">
      <header className="px-8 py-6 border-b border-border bg-card/50">
        <h1 className="text-2xl font-bold tracking-tight">Debt Payoff</h1>
        <p className="text-sm text-muted-foreground">
          Smart allocation and payoff tracking
        </p>
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

                return (
                  <Card key={debt.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
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

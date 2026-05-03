import { getTaxOverview } from "@/lib/actions/taxes";
import { formatCurrency } from "@/lib/utils/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AddTaxObligationDialog } from "@/components/debts/add-tax-obligation-dialog";
import { LogTaxPaymentDialog } from "@/components/taxes/log-tax-payment-dialog";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  federal_income: "Federal income",
  state_income: "State income",
  back_taxes: "Back taxes",
  estimated_quarterly: "Estimated quarterly",
  penalty: "Penalty",
  other: "Other",
};

const STATUS_TONE: Record<string, string> = {
  active: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  upcoming: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  overdue: "bg-red-500/15 text-red-400 border-red-500/30",
  paid: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function METHOD_LABELS(m: string | null): string {
  if (!m) return "—";
  return (
    {
      direct_pay: "IRS Direct Pay",
      eftps: "EFTPS",
      check: "Check",
      payroll_deduction: "Payroll deduction",
      other: "Other",
    }[m] ?? m
  );
}

export default function TaxPage() {
  const overview = getTaxOverview();
  const hasAny = overview.active.length > 0 || overview.paid.length > 0;

  return (
    <div className="flex flex-col h-screen">
      <header className="px-8 py-6 border-b border-border bg-card/50 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tax Obligations</h1>
          <p className="text-sm text-muted-foreground">
            Federal, state, back taxes, estimated quarterly, penalties
          </p>
        </div>
        <AddTaxObligationDialog />
      </header>

      <div className="flex-1 overflow-auto p-8 space-y-6">
        {!hasAny ? (
          <Card>
            <CardContent className="py-12 text-center space-y-2">
              <p className="text-sm font-medium text-muted-foreground">No tax obligations tracked</p>
              <p className="text-xs text-muted-foreground">
                Add an obligation above, or tell Bud about it in chat.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Owed</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-red-400">{formatCurrency(overview.totalOwed)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    across {overview.active.length} active{" "}
                    {overview.active.length === 1 ? "obligation" : "obligations"}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Paid YTD</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-emerald-400">{formatCurrency(overview.totalPaidYTD)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date().getFullYear()} payments across all obligations
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Next Due</CardTitle>
                </CardHeader>
                <CardContent>
                  {overview.nextDue ? (
                    <>
                      <p className="text-lg font-semibold">{shortDate(overview.nextDue.dueDate)}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {overview.nextDue.agency} {overview.nextDue.taxYear} —{" "}
                        {formatCurrency(overview.nextDue.installmentAmount ?? overview.nextDue.remainingBalance)}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No due dates set</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Active obligations */}
            {overview.active.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Active</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {overview.active.map((o) => (
                    <Card key={o.id}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-base">
                            {o.agency} {o.taxYear}
                          </CardTitle>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={STATUS_TONE[o.status] ?? ""}>
                              {o.status}
                            </Badge>
                            <Badge variant="secondary">{TYPE_LABELS[o.type] ?? o.type}</Badge>
                            <LogTaxPaymentDialog
                              obligationId={o.id}
                              agency={o.agency}
                              taxYear={o.taxYear}
                              remainingBalance={o.remainingBalance}
                              installmentAmount={o.installmentAmount}
                            />
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Remaining</span>
                            <p className="font-semibold">{formatCurrency(o.remainingBalance)}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Original</span>
                            <p className="font-semibold">{formatCurrency(o.originalAmount)}</p>
                          </div>
                          {o.dueDate && (
                            <div>
                              <span className="text-muted-foreground">Due</span>
                              <p className="font-semibold">{shortDate(o.dueDate)}</p>
                            </div>
                          )}
                          {o.penaltyRate !== null && (
                            <div>
                              <span className="text-muted-foreground">Penalty rate</span>
                              <p className="font-semibold">{(o.penaltyRate * 100).toFixed(2)}%</p>
                            </div>
                          )}
                          {o.isInstallmentPlan && o.installmentAmount && (
                            <div className="col-span-2">
                              <span className="text-muted-foreground">Installment plan</span>
                              <p className="font-semibold">
                                {formatCurrency(o.installmentAmount)}/mo
                                {o.installmentDay ? ` on the ${o.installmentDay}${ordinalSuffix(o.installmentDay)}` : ""}
                              </p>
                            </div>
                          )}
                          {o.referenceNumber && (
                            <div className="col-span-2">
                              <span className="text-muted-foreground">Reference #</span>
                              <p className="font-semibold font-mono text-xs">{o.referenceNumber}</p>
                            </div>
                          )}
                        </div>

                        {o.originalAmount > 0 && (
                          <div>
                            <div className="flex justify-between text-xs text-muted-foreground mb-1">
                              <span>Paid down</span>
                              <span>
                                {o.pctPaid}% · {formatCurrency(o.paidOff)}
                              </span>
                            </div>
                            <Progress value={o.pctPaid} className="h-2" />
                          </div>
                        )}

                        {o.notes && (
                          <p className="text-xs text-muted-foreground italic">{o.notes}</p>
                        )}

                        {o.payments.length > 0 && (
                          <div className="text-xs space-y-1 border-t border-border pt-3">
                            <p className="font-medium text-muted-foreground">Recent payments</p>
                            {o.payments.slice(0, 3).map((p) => (
                              <div key={p.id} className="flex justify-between">
                                <span className="text-muted-foreground">
                                  {shortDate(p.date)} · {METHOD_LABELS(p.method)}
                                  {p.confirmationNumber ? ` · #${p.confirmationNumber}` : ""}
                                </span>
                                <span className="font-medium">{formatCurrency(p.amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Paid obligations */}
            {overview.paid.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Paid</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {overview.paid.map((o) => (
                    <Card key={o.id} className="opacity-75">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">
                            {o.agency} {o.taxYear}
                          </CardTitle>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={STATUS_TONE.paid}>paid</Badge>
                            <Badge variant="secondary">{TYPE_LABELS[o.type] ?? o.type}</Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          Paid off {formatCurrency(o.originalAmount)} ·{" "}
                          {o.payments.length} {o.payments.length === 1 ? "payment" : "payments"}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils/format";
import { TrendingDown, Target, Zap } from "lucide-react";

type Scenario = {
  label: string;
  extraMonthly: number;
  monthsToDebtFree: number | null;
  payoffDate: string | null;
  totalInterestPaid: number;
  totalPaid: number;
  interestSavedVsMin: number;
  monthsSavedVsMin: number | null;
};

type AvalancheStep = {
  debtId: string;
  creditorName: string;
  balance: number;
  apr: number;
  minimumPayment: number;
  monthlyInterest: number;
  payoffMonth: number;
  payoffDate: string;
};

type Props = {
  data: {
    totalBalance: number;
    totalMinimums: number;
    currentRecommendedTotal: number;
    scenarios: Scenario[];
    avalanche: AvalancheStep[];
    snowballMonths: number | null;
    avalancheMonths: number | null;
    highestImpactTarget: { debtId: string; creditorName: string; reason: string } | null;
  };
};

function formatPayoffMonth(ym: string): string {
  if (!ym || ym === "—") return "—";
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatYearsAndMonths(months: number | null): string {
  if (months === null) return "—";
  if (months === 0) return "now";
  if (months < 12) return `${months} mo`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m === 0 ? `${y} yr` : `${y} yr ${m} mo`;
}

export function DebtPayoffPlan({ data }: Props) {
  if (data.totalBalance === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm font-medium text-muted-foreground">No active debts</p>
          <p className="text-xs text-muted-foreground mt-1">Nothing to plan a payoff for.</p>
        </CardContent>
      </Card>
    );
  }

  const minScenario = data.scenarios[0];
  const currentScenario = data.scenarios[1];
  const aggressiveScenario = data.scenarios[3]; // +$300

  const strategyDelta =
    data.snowballMonths !== null && data.avalancheMonths !== null
      ? data.snowballMonths - data.avalancheMonths
      : null;

  return (
    <div className="space-y-6">
      {/* Headline metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Active Debt</p>
            <p className="text-2xl font-bold tracking-tight mt-1 text-red-500">
              {formatCurrency(data.totalBalance)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatCurrency(data.totalMinimums)}/mo minimums
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Debt-Free At Minimums</p>
            <p className="text-2xl font-bold tracking-tight mt-1">
              {formatYearsAndMonths(minScenario.monthsToDebtFree)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {minScenario.payoffDate ? formatPayoffMonth(minScenario.payoffDate) : "never (interest > min)"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Debt-Free At Current Pace</p>
            <p className="text-2xl font-bold tracking-tight mt-1 text-emerald-600">
              {formatYearsAndMonths(currentScenario.monthsToDebtFree)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {currentScenario.payoffDate ? formatPayoffMonth(currentScenario.payoffDate) : "—"}
              {currentScenario.monthsSavedVsMin && currentScenario.monthsSavedVsMin > 0 && (
                <> · {currentScenario.monthsSavedVsMin} mo sooner</>
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Interest at Minimums</p>
            <p className="text-2xl font-bold tracking-tight mt-1 text-red-500">
              {formatCurrency(minScenario.totalInterestPaid)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              total over the payoff window
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Strategy callout */}
      {data.highestImpactTarget && (
        <Card className="border-amber-300 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20">
          <CardContent className="py-4 px-5 flex items-start gap-3">
            <Zap className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <span className="font-semibold">Attack first: </span>
              <span className="font-medium">{data.highestImpactTarget.creditorName}</span>
              <span className="text-muted-foreground"> — {data.highestImpactTarget.reason}.</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scenarios table — what each $X buys */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            What Each Extra Dollar Buys You
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Strategy</TableHead>
                <TableHead className="text-right">Total Monthly</TableHead>
                <TableHead className="text-right">Debt-Free</TableHead>
                <TableHead className="text-right">vs Minimums</TableHead>
                <TableHead className="text-right">Total Interest</TableHead>
                <TableHead className="text-right">Interest Saved</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.scenarios.map((s, i) => {
                const totalMonthly = data.totalMinimums + s.extraMonthly;
                const isCurrent = i === 1;
                return (
                  <TableRow key={s.label} className={isCurrent ? "bg-accent/30" : undefined}>
                    <TableCell className="font-medium">
                      {s.label}
                      {isCurrent && <Badge variant="secondary" className="ml-2 text-xs">current</Badge>}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(totalMonthly)}</TableCell>
                    <TableCell className="text-right">
                      {formatYearsAndMonths(s.monthsToDebtFree)}
                    </TableCell>
                    <TableCell className="text-right text-emerald-600">
                      {s.monthsSavedVsMin && s.monthsSavedVsMin > 0
                        ? `${s.monthsSavedVsMin} mo sooner`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(s.totalInterestPaid)}</TableCell>
                    <TableCell className="text-right text-emerald-600 font-medium">
                      {s.interestSavedVsMin > 0 ? formatCurrency(s.interestSavedVsMin) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground mt-3">
            Extra dollars are applied via avalanche (highest-APR debt first). When a debt clears, its
            minimum payment rolls into the extra pool, accelerating the next debt — the snowball effect.
          </p>
        </CardContent>
      </Card>

      {/* Avalanche order — per-debt detail */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-primary" />
            Payoff Order (Avalanche, at Current Pace)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Debt</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">APR</TableHead>
                <TableHead className="text-right">Minimum</TableHead>
                <TableHead className="text-right">Monthly Interest</TableHead>
                <TableHead className="text-right">Payoff</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.avalanche.map((d, i) => (
                <TableRow key={d.debtId}>
                  <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{d.creditorName}</TableCell>
                  <TableCell className="text-right">{formatCurrency(d.balance)}</TableCell>
                  <TableCell className="text-right">
                    <span className={d.apr > 0.25 ? "text-red-500 font-medium" : ""}>
                      {(d.apr * 100).toFixed(2)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(d.minimumPayment)}</TableCell>
                  <TableCell className="text-right text-red-500">
                    {formatCurrency(d.monthlyInterest)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {d.payoffMonth > 0 ? formatPayoffMonth(d.payoffDate) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Strategy comparison */}
      {strategyDelta !== null && (
        <Card>
          <CardContent className="py-4 px-5">
            <p className="text-sm">
              <span className="font-medium">Avalanche vs snowball: </span>
              <span className="text-muted-foreground">
                At minimum payments only,{" "}
                {strategyDelta > 0 ? (
                  <>avalanche gets you debt-free <span className="font-medium text-emerald-600">{strategyDelta} months sooner</span> than snowball.</>
                ) : strategyDelta < 0 ? (
                  <>snowball gets you debt-free <span className="font-medium text-emerald-600">{Math.abs(strategyDelta)} months sooner</span> than avalanche (your smallest debts have the highest APRs).</>
                ) : (
                  <>both strategies finish at the same time for your debt mix.</>
                )}
              </span>
            </p>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Simulations assume minimum payments stay flat (they typically decline as balance drops, so real
        payoff windows may be slightly longer). APRs reflect current rates — actual rates can change.
      </p>
    </div>
  );
}

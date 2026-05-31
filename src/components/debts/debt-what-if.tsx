"use client";

import { useState, useMemo } from "react";
import { formatCurrency } from "@/lib/utils/format";
import { singleDebtPayoff, addMonths } from "@/lib/utils/debt-engine";
import { Calculator } from "lucide-react";

type Props = {
  balance: number; // cents
  minimumPayment: number; // cents
  interestRate: number; // decimal
  currentExtra?: number; // cents — what's already being paid above minimum (from smart allocation)
};

function formatYM(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

const PRESETS = [0, 25, 50, 100, 200];

export function DebtWhatIfCalculator({ balance, minimumPayment, interestRate, currentExtra = 0 }: Props) {
  const [extraDollars, setExtraDollars] = useState<number>(50);

  const baseline = useMemo(
    () => singleDebtPayoff(balance, minimumPayment, interestRate),
    [balance, minimumPayment, interestRate],
  );

  const scenario = useMemo(
    () => singleDebtPayoff(balance, minimumPayment + extraDollars * 100, interestRate),
    [balance, minimumPayment, interestRate, extraDollars],
  );

  const monthsSaved =
    baseline.months !== null && scenario.months !== null
      ? baseline.months - scenario.months
      : null;
  const interestSaved = baseline.totalInterest - scenario.totalInterest;
  const payoffDate = scenario.months !== null ? formatYM(addMonths(scenario.months)) : "—";

  return (
    <div className="rounded-md border border-input bg-background p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Calculator className="w-3.5 h-3.5" />
          What if I pay extra?
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">+$</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            step="25"
            value={extraDollars}
            onChange={(e) => setExtraDollars(Math.max(0, parseInt(e.target.value, 10) || 0))}
            className="w-16 rounded-md border border-input bg-background px-2 py-1 text-xs text-right"
          />
          <span className="text-xs text-muted-foreground">/mo</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setExtraDollars(p)}
            className={`text-[10px] px-2 py-0.5 rounded-md border ${
              extraDollars === p
                ? "border-primary bg-primary/10 text-primary"
                : "border-input text-muted-foreground hover:bg-accent"
            }`}
          >
            +${p}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Payoff</p>
          <p className="font-semibold">{payoffDate}</p>
          {scenario.months !== null && (
            <p className="text-[10px] text-muted-foreground">{scenario.months} mo</p>
          )}
        </div>
        <div>
          <p className="text-muted-foreground">Months saved</p>
          <p className={`font-semibold ${monthsSaved && monthsSaved > 0 ? "text-emerald-500" : ""}`}>
            {monthsSaved !== null ? (monthsSaved > 0 ? `${monthsSaved} mo` : "—") : "—"}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Interest saved</p>
          <p className={`font-semibold ${interestSaved > 0 ? "text-emerald-500" : ""}`}>
            {interestSaved > 0 ? formatCurrency(interestSaved) : "—"}
          </p>
        </div>
      </div>

      {currentExtra > 0 && (
        <p className="text-[10px] text-muted-foreground">
          Smart allocation already adds {formatCurrency(currentExtra)}/mo above the minimum. The
          numbers above stack on top of that.
        </p>
      )}
    </div>
  );
}

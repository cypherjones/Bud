import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import { Lock, Heart, Repeat, Sparkles, ArrowRight, TrendingUp } from "lucide-react";
import type { BudgetStrategy } from "@/lib/actions/budget";
import { BucketCard } from "./bucket-card";

type Props = {
  strategy: BudgetStrategy;
};

const BUCKET_META = {
  committed: {
    label: "Committed",
    sublabel: "rent · debt · utilities",
    color: "#475569",   // slate-600 — heavy/locked feel
    icon: <Lock className="w-3.5 h-3.5" />,
  },
  essential: {
    label: "Essential",
    sublabel: "groceries · health · gas",
    color: "#0d9488",   // teal-600
    icon: <Heart className="w-3.5 h-3.5" />,
  },
  operational: {
    label: "Operational",
    sublabel: "subs · services",
    color: "#2563eb",   // blue-600
    icon: <Repeat className="w-3.5 h-3.5" />,
  },
  discretionary: {
    label: "Discretionary",
    sublabel: "food out · shopping · fun",
    color: "#dc2626",   // red-600 — the lever
    icon: <Sparkles className="w-3.5 h-3.5" />,
  },
} as const;

export function AllocationCards({ strategy }: Props) {
  // Surplus check uses the SAME number the SurplusCard displays as headline:
  // projectedNextMonthNet (cash-flow accounting). Previously this used trailing-30
  // surplusMonthly which could disagree with the headline — e.g., trailing-30 says
  // deficit while cash-flow projection says surplus, producing "Cut spending to flip
  // positive" while the card showed +$3,921. That contradiction's gone.
  const surplusPositive = strategy.projectedNextMonthNet >= 0;
  const incomeShown = strategy.incomeRecurringMonthly;

  let surplusFlow: string;
  if (!surplusPositive) {
    surplusFlow = "Cut spending to flip positive";
  } else if (strategy.phase === "build_buffer" && !strategy.moveUnlocked) {
    surplusFlow = "Allocate to Cash Buffer (manual transfer)";
  } else if (strategy.phase === "save" || strategy.moveUnlocked) {
    surplusFlow = "Allocate to Houston savings (manual transfer)";
  } else {
    surplusFlow = "Available — no destination committed";
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">
          Allocation
          <span className="font-normal text-muted-foreground"> · {new Date().toLocaleDateString("en-US", { month: "long" })} so far · income → buckets → net</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Layout: Income card → 4 bucket cards (where it goes) → Net card.
            Income on the left answers "$10k/mo from where?" — flows visually
            into the buckets that consume it, then the Net card on the right
            shows what's left after scheduled bills + variable burn. */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <IncomeCard strategy={strategy} />
          <BucketCard bucket={strategy.buckets.committed} meta={BUCKET_META.committed} totalIncome={incomeShown} daysElapsed={strategy.daysElapsedThisMonth} daysInMonth={strategy.daysInThisMonth} />
          <BucketCard bucket={strategy.buckets.essential} meta={BUCKET_META.essential} totalIncome={incomeShown} daysElapsed={strategy.daysElapsedThisMonth} daysInMonth={strategy.daysInThisMonth} />
          <BucketCard
            bucket={strategy.buckets.operational}
            meta={BUCKET_META.operational}
            totalIncome={incomeShown}
            daysElapsed={strategy.daysElapsedThisMonth}
            daysInMonth={strategy.daysInThisMonth}
            killListSavings={strategy.killListMonthlySavings}
          />
          <BucketCard bucket={strategy.buckets.discretionary} meta={BUCKET_META.discretionary} totalIncome={incomeShown} daysElapsed={strategy.daysElapsedThisMonth} daysInMonth={strategy.daysInThisMonth} />
          <SurplusCard strategy={strategy} surplusFlow={surplusFlow} />
        </div>
      </CardContent>
    </Card>
  );
}

function IncomeCard({ strategy }: { strategy: BudgetStrategy }) {
  // Recurring monthly income with hover detail showing each source. Trailing-30
  // ad-hoc income (gusto bonuses, etc.) shown as small delta line if it
  // meaningfully exceeds the recurring base. Counterbalances the bucket cards
  // visually — "this is where it comes from, those are where it goes."
  const recurring = strategy.incomeRecurringMonthly;
  const actual = strategy.incomeActualTrailing30;
  const adhocCents = Math.max(0, actual - recurring);
  const showAdhoc = adhocCents > recurring * 0.05;
  const top3 = strategy.incomeBreakdown.slice(0, 3);
  const moreCount = Math.max(0, strategy.incomeBreakdown.length - 3);

  return (
    <div className="relative group">
      <Card className="border-emerald-300 dark:border-emerald-800 group-hover:shadow-md transition-all">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
              <TrendingUp className="w-3.5 h-3.5" />
              <p className="text-xs font-medium">Income</p>
            </div>
          </div>
          <p className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatCurrency(recurring)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {strategy.incomeBreakdown.length} source{strategy.incomeBreakdown.length === 1 ? "" : "s"} · recurring/mo
          </p>
          <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
            Trailing-30: {formatCurrency(actual)}
          </p>
          {showAdhoc && (
            <p className="text-[10px] text-emerald-600 dark:text-emerald-500 mt-0.5 tabular-nums">
              +{formatCurrency(adhocCents)} ad-hoc
            </p>
          )}
        </CardContent>
      </Card>

      {/* Hover tooltip — top recurring sources. Mirrors BucketCard's pattern
          (positioned ABOVE the card to escape Card's overflow-hidden). */}
      {top3.length > 0 && (
        <div className="absolute z-50 left-0 right-0 bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
          <div
            className="bg-popover border border-border rounded-md shadow-xl p-2.5 text-[11px] space-y-1.5"
            style={{ borderBottomWidth: "2px", borderBottomColor: "#10b981" }}
          >
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold pb-1.5 border-b border-border/60">
              Top {top3.length} income source{top3.length === 1 ? "" : "s"}
            </p>
            {top3.map((src) => (
              <div key={src.merchant} className="flex items-center justify-between gap-2">
                <span className="truncate">{src.merchant}</span>
                <span className="font-medium tabular-nums shrink-0">{formatCurrency(src.monthly)}</span>
              </div>
            ))}
            {moreCount > 0 && (
              <p className="text-[10px] text-muted-foreground pt-1 border-t border-border/60">
                +{moreCount} more · see /reports
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SurplusCard({ strategy, surplusFlow }: { strategy: BudgetStrategy; surplusFlow: string }) {
  // Forward-looking, cash-flow accounting headline. This is "starting balance,
  // walked through scheduled bills + paychecks + budget-capped discretionary,
  // what's the balance at month end?" — the truth-teller. Distinct from the
  // bucket cards which show trailing-30 spending pattern.
  const monthlyNet = strategy.projectedNextMonthNet;
  const surplusPositive = monthlyNet >= 0;

  return (
    <Card className={surplusPositive ? "border-emerald-300 dark:border-emerald-800" : "border-red-300 dark:border-red-900"}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-1.5 mb-1">
          <ArrowRight className={`w-3.5 h-3.5 ${surplusPositive ? "text-emerald-600" : "text-red-500"}`} />
          <p className="text-xs font-medium">{surplusPositive ? "Net per month" : "Loss per month"}</p>
        </div>
        <p className={`text-xl font-bold tabular-nums ${surplusPositive ? "text-emerald-600" : "text-red-500"}`}>
          {surplusPositive ? "+" : "−"}{formatCurrency(Math.abs(monthlyNet))}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{surplusFlow}</p>
        <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
          Rest of {new Date().toLocaleDateString("en-US", { month: "short" })}: {strategy.projectedRestOfMonthNet >= 0 ? "+" : "−"}{formatCurrency(Math.abs(strategy.projectedRestOfMonthNet))}
        </p>
        <p className="text-[10px] text-muted-foreground/70 mt-0.5">
          (forward cash-flow projection — not the same as bucket totals at left)
        </p>
      </CardContent>
    </Card>
  );
}


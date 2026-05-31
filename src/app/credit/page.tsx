import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import { getCreditSummary } from "@/lib/actions/dashboard";
import { getCreditTriage, getScoreProjection } from "@/lib/actions/credit-triage";
import { CreditDetailView } from "@/components/credit/credit-detail-view";
import { LogCreditScoreDialog } from "@/components/credit/log-credit-score-dialog";
import { CreditTriageTable } from "@/components/credit/credit-triage-table";
import { SettlementBudgetCard } from "@/components/credit/settlement-budget-card";
import { CreditTimeline } from "@/components/credit/credit-timeline";
import { ScoreProjectionCard } from "@/components/credit/score-projection-card";

export const dynamic = "force-dynamic";

export default function CreditPage() {
  const creditData = getCreditSummary();
  const triage = getCreditTriage();
  // Score projection uses the most recent logged score, falling back to 519 (the
  // FICO 8 from the user's Apr 27, 2026 report) when nothing has been logged yet.
  const currentScore = creditData?.latest.score ?? 519;
  const projection = getScoreProjection(currentScore, triage);

  // Combined list of derogatories for the timeline visual
  const derogatories = [...triage.chargeOffs, ...triage.collections];

  return (
    <div className="flex flex-col h-screen">
      <header className="px-8 py-6 border-b border-border bg-card/50 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" />
            Credit
          </h1>
          <p className="text-sm text-muted-foreground">
            Score, triage, and the path to 600+
          </p>
        </div>
        <LogCreditScoreDialog />
      </header>
      <div className="flex-1 overflow-auto p-8 space-y-6">
        {creditData ? (
          <CreditDetailView
            data={{
              ...creditData,
              factors: creditData.factors ?? null,
            }}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Score History</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground text-center py-8">
                No credit score logged yet. Use “Log score” above or tell Bud in chat.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Strategic top row: budget + projection side-by-side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SettlementBudgetCard summary={triage.summary} />
          <ScoreProjectionCard projection={projection} />
        </div>

        {/* Timeline */}
        <CreditTimeline items={derogatories} />

        {/* Triage table */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Credit Report Triage</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Every active account, charge-off, collection, and authorized-user tradeline from your
            Experian report. Mark each item as you work through it.
          </p>
          <CreditTriageTable
            active={triage.active}
            authorizedUser={triage.authorizedUser}
            chargeOffs={triage.chargeOffs}
            collections={triage.collections}
          />
        </div>
      </div>
    </div>
  );
}

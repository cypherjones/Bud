import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Hourglass } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import type { CreditTriageItem } from "@/lib/actions/credit-triage";

type Props = {
  items: CreditTriageItem[];
};

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

function formatYM(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/**
 * Visualizes Texas 4-yr Statute of Limitations and 7-yr derogatory fall-off
 * for each charge-off and collection. The horizontal bar shows how far
 * each item is along its 7-yr life — and where the SoL line sits.
 *
 * Items closer to fall-off (right side) are cheaper to wait out than to
 * negotiate. Items past SoL (left of the dashed line) cannot legally be
 * sued for in Texas, which is leverage for settlement negotiation.
 */
export function CreditTimeline({ items }: Props) {
  const today = new Date();
  const eligible = items
    .filter((i) => i.firstDelinquencyDate && i.fallOffDate)
    .filter((i) => i.status !== "settled" && i.status !== "removed")
    .map((i) => {
      const start = new Date(i.firstDelinquencyDate + "-01T00:00:00");
      const end = new Date(i.fallOffDate! + "T00:00:00");
      const sol = new Date(i.solDate! + "T00:00:00");
      const totalMonths = 7 * 12;
      const elapsed = Math.max(0, Math.min(totalMonths, monthsBetween(start, today)));
      const solPosition = Math.max(0, Math.min(totalMonths, monthsBetween(start, sol)));
      const monthsToFallOff = monthsBetween(today, end);
      const monthsToSol = monthsBetween(today, sol);
      const pastSol = today >= sol;
      return {
        ...i,
        start,
        end,
        sol,
        totalMonths,
        elapsedPct: (elapsed / totalMonths) * 100,
        solPct: (solPosition / totalMonths) * 100,
        monthsToFallOff: Math.max(0, monthsToFallOff),
        monthsToSol,
        pastSol,
      };
    })
    .sort((a, b) => a.monthsToFallOff - b.monthsToFallOff);

  if (eligible.length === 0) return null;

  const pastSolCount = eligible.filter((e) => e.pastSol).length;
  const within2yrFallOff = eligible.filter((e) => e.monthsToFallOff <= 24).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-primary" />
          SoL &amp; Fall-Off Timeline
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Each derogatory falls off your report 7 years from first delinquency. In Texas, after 4
          years (Statute of Limitations) you can&apos;t legally be sued for the debt — which is
          your strongest negotiation lever. Items near fall-off are often cheaper to <em>wait out</em> than to settle.
        </p>
        {(pastSolCount > 0 || within2yrFallOff > 0) && (
          <div className="flex flex-wrap gap-2 mt-2">
            {pastSolCount > 0 && (
              <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
                {pastSolCount} item{pastSolCount > 1 ? "s" : ""} past SoL — leverage
              </Badge>
            )}
            {within2yrFallOff > 0 && (
              <Badge variant="outline" className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-[10px]">
                <Hourglass className="w-3 h-3 mr-1" />
                {within2yrFallOff} within 2yr of fall-off
              </Badge>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {eligible.map((e) => (
            <div key={e.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">{e.creditor}</span>
                  <span className="text-muted-foreground">{formatCurrency(e.balanceCents)}</span>
                </div>
                <div className="text-right">
                  {e.pastSol ? (
                    <span className="text-emerald-500 font-medium">past SoL</span>
                  ) : e.monthsToSol <= 12 ? (
                    <span className="text-amber-500">SoL in {e.monthsToSol}mo</span>
                  ) : (
                    <span className="text-muted-foreground">SoL in {e.monthsToSol}mo</span>
                  )}
                  <span className="text-muted-foreground"> · falls off in {e.monthsToFallOff}mo</span>
                </div>
              </div>
              <div className="relative h-3 rounded-full bg-muted overflow-visible">
                {/* elapsed fill */}
                <div
                  className={`absolute top-0 left-0 h-full rounded-full transition-all ${
                    e.pastSol ? "bg-emerald-500/60" : "bg-amber-500/60"
                  }`}
                  style={{ width: `${e.elapsedPct}%` }}
                />
                {/* SoL marker */}
                <div
                  className="absolute top-[-2px] bottom-[-2px] w-px border-l-2 border-dashed border-foreground/60"
                  style={{ left: `${e.solPct}%` }}
                />
                {/* "today" marker is implicit at end of fill */}
                <div
                  className="absolute top-[-2px] bottom-[-2px] w-1 bg-primary rounded-full"
                  style={{ left: `calc(${e.elapsedPct}% - 2px)` }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground">
                <span>{formatYM(e.start.toISOString().slice(0, 10))} (1st delinq)</span>
                <span>4yr SoL</span>
                <span>{formatYM(e.end.toISOString().slice(0, 10))} (falls off)</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-border text-[10px] text-muted-foreground space-y-1">
          <p>
            <span className="inline-block w-3 h-1 bg-amber-500/60 rounded-full mr-1" />
            Filled = time elapsed since first delinquency
          </p>
          <p>
            <span className="inline-block w-2 h-2 bg-primary rounded-full mr-1" />
            Today &nbsp;
            <span className="inline-block w-3 border-t-2 border-dashed border-foreground/60 mx-1" />
            Texas SoL (4yr — past this, can&apos;t be sued)
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

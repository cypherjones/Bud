import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Target } from "lucide-react";
import type { ScoreProjection } from "@/lib/actions/credit-triage";

type Props = {
  projection: ScoreProjection;
};

function tierColor(score: number): string {
  if (score >= 740) return "text-emerald-600";
  if (score >= 670) return "text-blue-600";
  if (score >= 580) return "text-amber-500";
  return "text-red-500";
}

function tierLabel(score: number): string {
  if (score >= 800) return "Exceptional";
  if (score >= 740) return "Very Good";
  if (score >= 670) return "Good";
  if (score >= 580) return "Fair";
  return "Poor";
}

export function ScoreProjectionCard({ projection }: Props) {
  const { currentScore, levers, ceilingScore } = projection;
  const totalGain = ceilingScore - currentScore;
  const goal600 = Math.max(0, 600 - currentScore);
  const goal670 = Math.max(0, 670 - currentScore);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          Score Projection
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Heuristic estimates of how much each lever could move your FICO. Numbers are
          directional — exact outcomes vary, but the <em>ranking</em> is what matters: do the free wins first.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score arc */}
        <div className="grid grid-cols-3 gap-3 items-end">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase">Current</p>
            <p className={`text-3xl font-bold tracking-tight ${tierColor(currentScore)}`}>{currentScore}</p>
            <p className="text-[10px] text-muted-foreground">{tierLabel(currentScore)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Potential gain</p>
            <p className="text-2xl font-bold text-emerald-500">+{totalGain}</p>
            <p className="text-[10px] text-muted-foreground">all levers stacked</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground uppercase">Ceiling</p>
            <p className={`text-3xl font-bold tracking-tight ${tierColor(ceilingScore)}`}>{ceilingScore}</p>
            <p className="text-[10px] text-muted-foreground">{tierLabel(ceilingScore)}</p>
          </div>
        </div>

        {/* Goal markers */}
        <div className="flex flex-wrap gap-2">
          {goal600 > 0 ? (
            <Badge variant="outline" className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-[10px]">
              {goal600} pts to 600 (Fair)
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
              ✓ 600 reached
            </Badge>
          )}
          {goal670 > 0 ? (
            <Badge variant="outline" className="bg-purple-500/15 text-purple-400 border-purple-500/30 text-[10px]">
              {goal670} pts to 670 (Good)
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
              ✓ 670 reached
            </Badge>
          )}
        </div>

        {/* Levers */}
        <div className="space-y-2 pt-3 border-t border-border">
          <p className="text-[10px] font-medium text-muted-foreground uppercase">Levers ranked by impact</p>
          {levers
            .slice()
            .sort((a, b) => b.projectedGain - a.projectedGain)
            .map((l, i) => (
              <div key={i} className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{l.label}</span>
                    {l.blocked && (
                      <Badge variant="outline" className="bg-muted text-muted-foreground text-[9px]">
                        {l.blocked}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{l.rationale}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-emerald-500">+{l.projectedGain}</p>
                  <p className="text-[9px] text-muted-foreground">pts</p>
                </div>
              </div>
            ))}
        </div>

        {/* Path */}
        <div className="pt-3 border-t border-border">
          <p className="text-[10px] font-medium text-muted-foreground uppercase mb-1.5 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            Recommended path
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">{projection.pathToGoal}</p>
        </div>
      </CardContent>
    </Card>
  );
}

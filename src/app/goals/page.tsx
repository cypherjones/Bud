import { db, schema } from "@/lib/db";
import { eq, or } from "drizzle-orm";
import { formatCurrency } from "@/lib/utils/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { getGoalContributions, getLinkableTransactions } from "@/lib/actions/goals";
import { LinkContributionDialog } from "@/components/goals/link-contribution-dialog";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  // Read from both financialPlans (savings_goal type) and savingsGoals table
  const plans = await db
    .select()
    .from(schema.financialPlans)
    .where(
      or(
        eq(schema.financialPlans.type, "savings_goal"),
        eq(schema.financialPlans.type, "custom"),
      )
    )
    .all();

  const savingsGoals = await db.select().from(schema.savingsGoals).all();

  // Combine both into a unified list. Goals can show up in either table
  // depending on which AI tool created them (create_savings_goal vs.
  // create_financial_plan with type='savings_goal'). De-dupe by lowercase
  // name; when a goal exists in both tables, prefer savingsGoals as the
  // canonical row but inherit the plan's targetDate if the goal lacks one.
  type Goal = {
    id: string;
    name: string;
    targetAmount: number;
    currentAmount: number;
    targetDate: string | null;
    status: string;
    source: "plan" | "goal";
  };

  const byName = new Map<string, Goal>();

  for (const p of plans) {
    byName.set(p.name.toLowerCase(), {
      id: p.id,
      name: p.name,
      targetAmount: p.targetAmount ?? 0,
      currentAmount: p.currentSaved,
      targetDate: p.targetDate,
      status: p.status,
      source: "plan",
    });
  }

  for (const g of savingsGoals) {
    const key = g.name.toLowerCase();
    const existing = byName.get(key);
    byName.set(key, {
      id: g.id,
      name: g.name,
      targetAmount: g.targetAmount || existing?.targetAmount || 0,
      currentAmount: g.currentAmount,
      targetDate: g.targetDate ?? existing?.targetDate ?? null,
      status: existing?.status ?? "in_progress",
      source: "goal",
    });
  }

  const goals = [...byName.values()];
  const hasGoals = goals.length > 0;

  // Per-goal contribution detail (only for goals backed by a savings_goals row,
  // since linked_goal_id references that table).
  const contributionsByGoal = new Map<string, ReturnType<typeof getGoalContributions>>();
  for (const g of goals) {
    if (g.source === "goal") {
      contributionsByGoal.set(g.id, getGoalContributions(g.id));
    }
  }
  const linkable = hasGoals ? getLinkableTransactions(40) : [];

  return (
    <div className="flex flex-col h-screen">
      <header className="px-8 py-6 border-b border-border bg-card/50">
        <h1 className="text-2xl font-bold tracking-tight">Savings Goals</h1>
        <p className="text-sm text-muted-foreground">
          Track progress toward your financial goals
        </p>
      </header>
      <div className="flex-1 overflow-auto p-8 space-y-6">
        {!hasGoals ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  No savings goals yet
                </p>
                <p className="text-xs text-muted-foreground">
                  Open Chat and tell Bud what you&apos;re saving for — it&apos;ll
                  create and track your goals automatically.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {goals.map((goal) => {
              const pct =
                goal.targetAmount > 0
                  ? Math.min(
                      Math.round((goal.currentAmount / goal.targetAmount) * 100),
                      100,
                    )
                  : 0;
              const remaining = Math.max(goal.targetAmount - goal.currentAmount, 0);

              return (
                <Card key={goal.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-semibold">
                        {goal.name}
                      </CardTitle>
                      <Badge
                        variant="secondary"
                        className={
                          goal.status === "completed"
                            ? "bg-green-100 text-green-700"
                            : "bg-blue-100 text-blue-700"
                        }
                      >
                        {goal.status === "completed"
                          ? "Complete"
                          : `${pct}%`}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Progress value={pct} className="h-2" />
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {formatCurrency(goal.currentAmount)} saved
                      </span>
                      <span className="font-medium">
                        {formatCurrency(goal.targetAmount)} goal
                      </span>
                    </div>
                    {remaining > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(remaining)} to go
                        {goal.targetDate && (
                          <>
                            {" "}
                            — target:{" "}
                            {new Date(goal.targetDate + "T00:00:00").toLocaleDateString(
                              "en-US",
                              { month: "short", day: "numeric", year: "numeric" },
                            )}
                          </>
                        )}
                      </p>
                    )}
                    {remaining > 0 && goal.targetDate && (
                      <PaceLine remaining={remaining} targetDate={goal.targetDate} />
                    )}

                    {goal.source === "goal" && (
                      <Contributions
                        goalId={goal.id}
                        goalName={goal.name}
                        contributions={contributionsByGoal.get(goal.id) ?? []}
                        linkable={linkable}
                      />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Required-monthly-contribution line shown under each goal that has a target
 * date. Pure math — no contribution-history tracking yet, so we don't try to
 * project "at current pace, you'll hit it on [date]."
 */
function PaceLine({ remaining, targetDate }: { remaining: number; targetDate: string }) {
  const target = new Date(targetDate + "T00:00:00");
  const now = new Date();
  const monthsRemaining =
    (target.getFullYear() - now.getFullYear()) * 12 +
    (target.getMonth() - now.getMonth()) +
    (target.getDate() >= now.getDate() ? 0 : -1);

  if (monthsRemaining <= 0) {
    return (
      <div className="rounded-md bg-red-50/60 dark:bg-red-950/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">
        Past target date — set a new one or log progress to update.
      </div>
    );
  }

  const requiredPerMonth = Math.ceil(remaining / monthsRemaining);
  const requiredPerWeek = Math.ceil(requiredPerMonth / 4.345);

  return (
    <div className="rounded-md bg-muted/40 px-3 py-2 text-xs space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Pace to hit target</span>
        <span className="font-medium">
          {formatCurrency(requiredPerMonth)}/mo · {formatCurrency(requiredPerWeek)}/wk
        </span>
      </div>
      <p className="text-muted-foreground">
        {monthsRemaining} {monthsRemaining === 1 ? "month" : "months"} remaining
      </p>
    </div>
  );
}

function shortDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Contributions({
  goalId,
  goalName,
  contributions,
  linkable,
}: {
  goalId: string;
  goalName: string;
  contributions: { id: string; date: string; amount: number; description: string; merchant: string | null; accountName: string | null }[];
  linkable: { id: string; date: string; amount: number; description: string; merchant: string | null; accountName: string | null; accountSubtype: string | null }[];
}) {
  const total = contributions.reduce((s, c) => s + c.amount, 0);

  return (
    <div className="border-t border-border pt-3 space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">
          Contributions{" "}
          <span className="text-foreground font-medium">
            ({contributions.length} · {formatCurrency(total)})
          </span>
        </span>
        <LinkContributionDialog goalId={goalId} goalName={goalName} candidates={linkable} />
      </div>
      {contributions.slice(0, 3).map((c) => (
        <div key={c.id} className="flex items-center justify-between text-muted-foreground">
          <span className="truncate">
            {shortDate(c.date)}
            {c.accountName ? ` · ${c.accountName}` : ""}
            {c.merchant ? ` · ${c.merchant}` : ""}
          </span>
          <span className="font-medium text-foreground">{formatCurrency(c.amount)}</span>
        </div>
      ))}
      {contributions.length > 3 && (
        <p className="text-muted-foreground">+{contributions.length - 3} more</p>
      )}
    </div>
  );
}

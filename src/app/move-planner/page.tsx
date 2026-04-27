import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { formatCurrency } from "@/lib/utils/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { MapPin, Calendar, CheckCircle, Circle } from "lucide-react";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  housing: "Housing",
  moving_logistics: "Moving Logistics",
  utilities: "Utilities",
  furniture: "Furniture & Setup",
  emergency: "Emergency Fund",
};

const CATEGORY_ORDER = [
  "housing",
  "moving_logistics",
  "utilities",
  "furniture",
  "emergency",
];

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default async function MovePlannerPage() {
  const plan = await db.query.financialPlans.findFirst({
    where: eq(schema.financialPlans.type, "move"),
  });

  const lineItems = plan
    ? await db.query.planLineItems.findMany({
        where: eq(schema.planLineItems.planId, plan.id),
        orderBy: (items, { asc }) => [asc(items.sortOrder)],
      })
    : [];

  // Group line items by category
  const grouped = CATEGORY_ORDER.reduce<
    Record<string, (typeof lineItems)[number][]>
  >((acc, cat) => {
    const items = lineItems.filter((item) => item.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  // Also include any categories not in the predefined order
  for (const item of lineItems) {
    if (!CATEGORY_ORDER.includes(item.category)) {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push(item);
    }
  }

  const totalEstimated = lineItems.reduce(
    (sum, item) => sum + (item.estimatedAmount ?? 0),
    0
  );
  const totalPaid = lineItems
    .filter((item) => item.isPaid)
    .reduce((sum, item) => sum + (item.actualAmount ?? item.estimatedAmount ?? 0), 0);
  const totalRemaining = totalEstimated - totalPaid;

  return (
    <div className="flex flex-col h-screen">
      <header className="px-8 py-6 border-b border-border bg-card/50">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <MapPin className="w-6 h-6 text-primary" />
          Houston Move Planner
        </h1>
        <p className="text-sm text-muted-foreground">
          Detailed cost planning for your move
        </p>
      </header>

      <div className="flex-1 overflow-auto p-8">
        {!plan ? (
          <Card className="max-w-lg mx-auto mt-16">
            <CardContent className="flex flex-col items-center gap-4 py-12">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <MapPin className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold text-center">
                Ask Bud to plan your Houston move
              </h2>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                Head to the chat and say something like &quot;Help me plan my
                move to Houston&quot; to get started with a detailed cost
                breakdown.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6 max-w-4xl mx-auto">
            {/* Summary Card */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <Badge
                      variant="outline"
                      className="mt-1 capitalize text-xs"
                    >
                      {plan.status}
                    </Badge>
                  </div>
                  {plan.targetDate && (
                    <div className="text-right">
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        {new Date(plan.targetDate).toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(() => {
                          const days = daysUntil(plan.targetDate);
                          if (days < 0) return `${Math.abs(days)} days ago`;
                          if (days === 0) return "Today";
                          return `${days} days away`;
                        })()}
                      </p>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {plan.targetAmount != null && plan.targetAmount > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Savings Progress
                      </span>
                      <span className="font-medium">
                        {formatCurrency(plan.currentSaved)} /{" "}
                        {formatCurrency(plan.targetAmount)}
                      </span>
                    </div>
                    <Progress
                      value={Math.min(
                        (plan.currentSaved / plan.targetAmount) * 100,
                        100
                      )}
                      className="h-3"
                    />
                    <p className="text-xs text-muted-foreground text-right">
                      {Math.round(
                        (plan.currentSaved / plan.targetAmount) * 100
                      )}
                      % saved
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Category Groups */}
            {Object.entries(grouped).map(([category, items]) => {
              const catEstimated = items.reduce(
                (sum, item) => sum + (item.estimatedAmount ?? 0),
                0
              );
              const catPaid = items
                .filter((item) => item.isPaid)
                .reduce(
                  (sum, item) =>
                    sum + (item.actualAmount ?? item.estimatedAmount ?? 0),
                  0
                );

              return (
                <Card key={category}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        {CATEGORY_LABELS[category] ?? category}
                      </CardTitle>
                      <span className="text-sm font-medium text-muted-foreground">
                        {formatCurrency(catEstimated)}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {items.map((item, idx) => (
                      <div key={item.id}>
                        {idx > 0 && <Separator className="my-2" />}
                        <div className="flex items-center gap-3 py-1">
                          {item.isPaid ? (
                            <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-sm font-medium truncate ${
                                  item.isPaid
                                    ? "line-through text-muted-foreground"
                                    : ""
                                }`}
                              >
                                {item.name}
                              </span>
                              {item.isRequired && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] px-1.5 py-0 shrink-0"
                                >
                                  Required
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {item.actualAmount != null ? (
                              <div>
                                <span className="text-sm font-medium">
                                  {formatCurrency(item.actualAmount)}
                                </span>
                                {item.estimatedAmount != null &&
                                  item.actualAmount !== item.estimatedAmount && (
                                    <span className="text-xs text-muted-foreground ml-1">
                                      (est.{" "}
                                      {formatCurrency(item.estimatedAmount)})
                                    </span>
                                  )}
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                {item.estimatedAmount != null
                                  ? formatCurrency(item.estimatedAmount)
                                  : "--"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    <Separator className="my-2" />
                    <div className="flex items-center justify-between text-sm pt-1">
                      <span className="text-muted-foreground">Subtotal</span>
                      <div className="text-right">
                        <span className="font-medium">
                          {formatCurrency(catEstimated)}
                        </span>
                        {catPaid > 0 && (
                          <span className="text-xs text-green-600 ml-2">
                            {formatCurrency(catPaid)} paid
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* Bottom Summary */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-6">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Total Estimated
                    </p>
                    <p className="text-lg font-bold mt-1">
                      {formatCurrency(totalEstimated)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Total Paid
                    </p>
                    <p className="text-lg font-bold text-green-600 mt-1">
                      {formatCurrency(totalPaid)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Remaining
                    </p>
                    <p className="text-lg font-bold text-amber-600 mt-1">
                      {formatCurrency(totalRemaining)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

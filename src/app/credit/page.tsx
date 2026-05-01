import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

export default function CreditPage() {
  return (
    <div className="flex flex-col h-screen">
      <header className="px-8 py-6 border-b border-border bg-card/50">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-primary" />
          Credit Score
        </h1>
        <p className="text-sm text-muted-foreground">
          Track your score and improvement factors
        </p>
      </header>
      <div className="flex-1 overflow-auto p-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score History</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground text-center py-8">
              No credit score logged yet. Tell Bud your current score.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

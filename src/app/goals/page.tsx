import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function GoalsPage() {
  return (
    <div className="flex flex-col h-screen">
      <header className="px-8 py-6 border-b border-border bg-card/50">
        <h1 className="text-2xl font-bold tracking-tight">Savings Goals</h1>
        <p className="text-sm text-muted-foreground">
          Track progress toward your financial goals
        </p>
      </header>
      <div className="flex-1 overflow-auto p-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your Goals</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground text-center py-8">
              No savings goals yet. Tell Bud what you&apos;re saving for.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

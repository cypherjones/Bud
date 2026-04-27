"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { MapPin, Calendar, CheckCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";

type Props = {
  data: {
    plan: { name: string; targetDate: string | null; currentSaved: number };
    target: number;
    progress: number;
    daysUntil: number | null;
    paidCount: number;
    items: { name: string; isPaid: boolean }[];
  } | null;
};

export function MoveTracker({ data }: Props) {
  if (!data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            Houston Move
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">
            No move plan yet. Ask Bud to help plan your Houston move.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          Houston Move
        </CardTitle>
        {data.daysUntil !== null && (
          <span className="text-sm text-muted-foreground flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {data.daysUntil} days
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Savings progress */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="font-bold text-lg">{formatCurrency(data.plan.currentSaved)}</span>
            <span className="text-muted-foreground">of {formatCurrency(data.target)}</span>
          </div>
          <Progress value={data.progress} className="h-2.5" />
          <p className="text-xs text-muted-foreground mt-1">{data.progress}% saved</p>
        </div>

        {/* Checklist preview */}
        <div className="text-sm flex items-center gap-1.5 text-muted-foreground">
          <CheckCircle className="w-3.5 h-3.5" />
          {data.paidCount} of {data.items.length} items covered
        </div>
      </CardContent>
    </Card>
  );
}

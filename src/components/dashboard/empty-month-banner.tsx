import { Card, CardContent } from "@/components/ui/card";
import { Info } from "lucide-react";

type Props = {
  reason: string;
};

/**
 * Subtle blue banner shown above a page's content when the page is showing
 * prior-month data because the current month has no synced transactions yet.
 */
export function EmptyMonthBanner({ reason }: Props) {
  return (
    <Card className="border-blue-300 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/20">
      <CardContent className="py-2 px-4 flex items-center gap-2 text-sm">
        <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
        <span>{reason}</span>
      </CardContent>
    </Card>
  );
}

"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";

const DATE_RANGES = [
  { label: "This Month", value: "this-month" },
  { label: "Last Month", value: "last-month" },
  { label: "Last 3 Months", value: "3-months" },
  { label: "All Time", value: "all" },
] as const;

interface TransactionFiltersProps {
  categories: { id: string; name: string; color: string | null }[];
}

export function TransactionFilters({ categories }: TransactionFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentRange = searchParams.get("range") ?? "this-month";
  const currentCategory = searchParams.get("category") ?? "all";

  const updateParams = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "all" || value === "this-month") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
      {/* Date range toggle */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
        {DATE_RANGES.map((range) => (
          <Button
            key={range.value}
            variant={currentRange === range.value || (range.value === "this-month" && !searchParams.get("range")) ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => updateParams("range", range.value)}
          >
            {range.label}
          </Button>
        ))}
      </div>

      {/* Category filter */}
      <select
        value={currentCategory}
        onChange={(e) => updateParams("category", e.target.value)}
        className="h-8 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="all">All Categories</option>
        {categories.map((cat) => (
          <option key={cat.id} value={cat.id}>
            {cat.name}
          </option>
        ))}
      </select>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/utils/format";
import { apiFetch } from "@/lib/client/api";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Check, Pencil, Plus, HelpCircle, Lock, Heart, Repeat, Sparkles, ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { BudgetRow, UnbudgetedRow } from "@/lib/actions/budget";
import type { AllocationBucketKey } from "@/lib/types/buckets";
import { getBucketForCategoryName, BUCKET_DISPLAY_ORDER, BUCKET_LABELS } from "@/lib/types/buckets";

type Category = {
  id: string;
  name: string;
  color: string | null;
  groupName: string | null;
};

/** Month-over-month delta for a category. Renders below spent value as a small
 *  signal: ↓ $X (less) green, ↑ $X (more) red, "—" gray when prior month had no
 *  data. Suppress entirely when the current spend is also zero (no signal).
 *  This is the awareness layer standard apps lead with — "is this month worse?". */
function MoMDelta({ currentSpent, prevMonthSpent }: { currentSpent: number; prevMonthSpent: number }) {
  if (prevMonthSpent === 0 && currentSpent === 0) return null;
  if (prevMonthSpent === 0) {
    return <p className="text-[10px] text-muted-foreground/60">no last-mo data</p>;
  }
  const delta = currentSpent - prevMonthSpent;
  const absDelta = Math.abs(delta);
  // < $5 noise threshold — don't decorate near-flat months.
  if (absDelta < 500) {
    return (
      <p className="text-[10px] text-muted-foreground/70 inline-flex items-center gap-0.5">
        <Minus className="w-2.5 h-2.5" />
        flat vs last mo
      </p>
    );
  }
  const isUp = delta > 0;
  return (
    <p className={`text-[10px] inline-flex items-center gap-0.5 tabular-nums ${isUp ? "text-red-500" : "text-emerald-600"}`}>
      {isUp ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
      {formatCurrency(absDelta)} vs last mo
    </p>
  );
}

type Props = {
  rows: BudgetRow[];
  unbudgetedRows: UnbudgetedRow[];
  unbudgetedCategories: Category[];
  budgetCoveragePercent: number;
};

type GroupBucket = {
  name: string;
  sort: number;
  budgeted: BudgetRow[];
  unbudgeted: UnbudgetedRow[];
};

type BucketSection = {
  key: AllocationBucketKey;
  groups: Map<string, GroupBucket>;
  totalBudgeted: number;
  totalSpent: number;
  totalUnbudgetedSpend: number;
  rowCount: number;
};

const BUCKET_ICONS: Record<AllocationBucketKey, React.ReactNode> = {
  committed: <Lock className="w-3.5 h-3.5" />,
  essential: <Heart className="w-3.5 h-3.5" />,
  operational: <Repeat className="w-3.5 h-3.5" />,
  discretionary: <Sparkles className="w-3.5 h-3.5" />,
};

export function BudgetTable({
  rows,
  unbudgetedRows,
  unbudgetedCategories,
  budgetCoveragePercent,
}: Props) {
  // Three-level hierarchy: BUCKET → GROUP → CATEGORY rows. Each row's bucket
  // is looked up from its category name (Housing → committed, Restaurants →
  // discretionary, etc.). Rows whose category isn't bucket-mapped land in a
  // synthetic "Unclassified" bucket at the end.
  const bucketSections = new Map<AllocationBucketKey | "unclassified", BucketSection>();
  const ensureBucket = (key: AllocationBucketKey | "unclassified"): BucketSection => {
    let s = bucketSections.get(key);
    if (!s) {
      s = { key: key as AllocationBucketKey, groups: new Map(), totalBudgeted: 0, totalSpent: 0, totalUnbudgetedSpend: 0, rowCount: 0 };
      bucketSections.set(key, s);
    }
    return s;
  };
  const ensureGroup = (bucket: BucketSection, groupName: string | null, groupSort: number | null): GroupBucket => {
    const k = groupName ?? "Other";
    let g = bucket.groups.get(k);
    if (!g) {
      g = { name: k, sort: groupSort ?? 99, budgeted: [], unbudgeted: [] };
      bucket.groups.set(k, g);
    }
    return g;
  };

  for (const r of rows) {
    const bucketKey = getBucketForCategoryName(r.categoryName) ?? "unclassified";
    const section = ensureBucket(bucketKey);
    ensureGroup(section, r.groupName, r.groupSort).budgeted.push(r);
    section.totalBudgeted += r.budgeted;
    section.totalSpent += r.spent;
    section.rowCount += 1;
  }
  for (const r of unbudgetedRows) {
    const bucketKey = getBucketForCategoryName(r.categoryName) ?? "unclassified";
    const section = ensureBucket(bucketKey);
    ensureGroup(section, r.groupName, r.groupSort).unbudgeted.push(r);
    section.totalUnbudgetedSpend += r.spent;
    section.rowCount += 1;
  }

  // Render order: committed → essential → operational → discretionary → unclassified.
  const orderedSections: { key: AllocationBucketKey | "unclassified"; section: BucketSection }[] = [];
  for (const k of BUCKET_DISPLAY_ORDER) {
    const s = bucketSections.get(k);
    if (s) orderedSections.push({ key: k, section: s });
  }
  const unclassified = bucketSections.get("unclassified");
  if (unclassified) orderedSections.push({ key: "unclassified", section: unclassified });

  // Header stats
  const totalBudgeted = rows.reduce((s, r) => s + r.budgeted, 0);
  const blownCount = rows.filter((r) => r.percentUsed > 100).length;
  const blownOverage = rows.filter((r) => r.percentUsed > 100).reduce((s, r) => s + Math.abs(r.remaining), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-medium">Budget table · by bucket</CardTitle>
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span>{rows.length} budgets · {formatCurrency(totalBudgeted)}/mo committed</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1" title={`Of every dollar you spent in the last 30 days, ${budgetCoveragePercent}% landed in a category that has a budget. The rest is unbudgeted spend (shown below in their group sections).`}>
              <HelpCircle className="w-3 h-3" />
              {budgetCoveragePercent}% of trailing-30 spend lives in a budgeted category
            </span>
            {blownCount > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="text-red-500">{blownCount} blown by {formatCurrency(blownOverage)}</span>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {orderedSections.map(({ key, section }) => (
          <BucketSectionDisplay key={key} bucketKey={key} section={section} />
        ))}

        {/* Totals row — single bottom-of-table summary mirroring the row layout
            so the columns line up. Distinct visual to read as a sum, not a row. */}
        <TotalsFooter rows={rows} unbudgetedRows={unbudgetedRows} />

        {/* Manual add — only categories with no spend at all show up here, since
            anything with spend already has an unbudgeted row in its group. */}
        <AddBudgetInline categories={unbudgetedCategories.filter((c) =>
          !unbudgetedRows.some((u) => u.categoryId === c.id),
        )} />
      </CardContent>
    </Card>
  );
}

/** Bucket-level section header + nested group sub-sections. */
function BucketSectionDisplay({
  bucketKey,
  section,
}: {
  bucketKey: AllocationBucketKey | "unclassified";
  section: BucketSection;
}) {
  const meta =
    bucketKey === "unclassified"
      ? { label: "Unclassified", sublabel: "categories not mapped to a bucket", color: "#6b7280" }
      : BUCKET_LABELS[bucketKey as AllocationBucketKey];
  const icon =
    bucketKey === "unclassified" ? null : BUCKET_ICONS[bucketKey as AllocationBucketKey];
  const groupList = [...section.groups.values()].sort((a, b) => a.sort - b.sort);
  const pct = section.totalBudgeted > 0 ? Math.round((section.totalSpent / section.totalBudgeted) * 100) : 0;

  return (
    <div
      id={`bucket-section-${bucketKey}`}
      className="bucket-section rounded-lg border border-border overflow-hidden"
    >
      {/* Bucket header — bold, color-tinted */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-2.5"
        style={{ backgroundColor: `${meta.color}15`, borderBottom: `1px solid ${meta.color}30` }}
      >
        <div className="flex items-center gap-2" style={{ color: meta.color }}>
          {icon}
          <p className="text-sm font-bold tracking-tight">{meta.label}</p>
          <span className="text-[10px] font-normal text-muted-foreground hidden sm:inline">
            {meta.sublabel}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {section.totalBudgeted > 0 && (
            <>
              <span className="text-muted-foreground tabular-nums">
                {formatCurrency(section.totalSpent)} / {formatCurrency(section.totalBudgeted)} MTD
              </span>
              <span className={`font-medium tabular-nums ${pct > 100 ? "text-red-500" : pct > 80 ? "text-amber-500" : "text-emerald-600"}`}>
                {pct}%
              </span>
            </>
          )}
          {section.totalUnbudgetedSpend > 0 && (
            <span className="text-muted-foreground">
              · {formatCurrency(section.totalUnbudgetedSpend)} unbudgeted (30d)
            </span>
          )}
        </div>
      </div>

      {/* Group sub-sections within the bucket */}
      <div className="p-3 space-y-3">
        {groupList.map((group) => (
          <GroupSection key={group.name} group={group} />
        ))}
      </div>
    </div>
  );
}

function GroupSection({ group }: { group: GroupBucket }) {
  // Sort within group: blown first (% used desc), then unbudgeted-with-spend
  // (by spend desc), then on-track budgets (% used desc).
  const sortedBudgeted = [...group.budgeted].sort((a, b) => {
    const aBlown = a.percentUsed > 100;
    const bBlown = b.percentUsed > 100;
    if (aBlown !== bBlown) return aBlown ? -1 : 1;
    return b.percentUsed - a.percentUsed;
  });
  const sortedUnbudgeted = [...group.unbudgeted].sort((a, b) => b.spent - a.spent);

  const groupBudgeted = group.budgeted.reduce((s, r) => s + r.budgeted, 0);
  const groupSpent = group.budgeted.reduce((s, r) => s + r.spent, 0);
  const groupUnbudgetedSpent = group.unbudgeted.reduce((s, r) => s + r.spent, 0);
  const groupPct = groupBudgeted > 0 ? Math.round((groupSpent / groupBudgeted) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-border">
        <p className="text-sm font-semibold tracking-tight">{group.name}</p>
        <div className="flex items-center gap-2 text-xs">
          {group.budgeted.length > 0 && (
            <span className="text-muted-foreground">
              {formatCurrency(groupSpent)} / {formatCurrency(groupBudgeted)} MTD
            </span>
          )}
          {group.budgeted.length > 0 && (
            <span className={`font-medium ${groupPct > 100 ? "text-red-500" : groupPct > 80 ? "text-amber-500" : "text-emerald-600"}`}>
              {groupPct}%
            </span>
          )}
          {group.unbudgeted.length > 0 && (
            <span className="text-muted-foreground">
              · {formatCurrency(groupUnbudgetedSpent)} unbudgeted (30d)
            </span>
          )}
        </div>
      </div>

      <div className="space-y-1 mt-2">
        {sortedBudgeted.map((row) => (
          <BudgetRowDisplay key={row.budgetId} row={row} />
        ))}
        {sortedUnbudgeted.map((row) => (
          <UnbudgetedRowDisplay key={row.categoryId} row={row} />
        ))}
      </div>
    </div>
  );
}

function BudgetRowDisplay({ row }: { row: BudgetRow }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState((row.budgeted / 100).toString());
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const overage = row.spent - row.budgeted;
  const isBlown = row.percentUsed > 100;
  const isWarn = row.percentUsed > 80 && !isBlown;
  const barClass = isBlown ? "[&>div]:bg-red-500" : isWarn ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500";

  const handleSave = async () => {
    const dollars = parseFloat(editValue);
    if (isNaN(dollars) || dollars < 0) return;
    setSaving(true);
    await apiFetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: row.categoryId, amount: dollars }),
    });
    setSaving(false);
    setEditing(false);
    router.refresh();
  };

  const handleDelete = async () => {
    await apiFetch("/api/budgets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budgetId: row.budgetId }),
    });
    router.refresh();
  };

  return (
    <div
      id={`budget-row-${row.categoryId}`}
      className={`budget-row grid grid-cols-12 gap-3 items-center py-2 px-3 rounded-md border ${
        isBlown ? "border-red-200 bg-red-50/30 dark:border-red-900/50 dark:bg-red-950/10" : "border-transparent hover:border-border hover:bg-accent/30"
      } transition-colors`}
    >
      <div className="col-span-4 flex items-center gap-2 min-w-0">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: row.categoryColor }} />
        <Link
          href={`/transactions?category=${row.categoryId}&range=3-months`}
          className="text-sm font-medium truncate hover:underline decoration-dotted underline-offset-2"
          title={`View ${row.categoryName} transactions`}
        >
          {row.categoryName}
        </Link>
      </div>

      <div className="col-span-2 text-right">
        {editing ? (
          <div className="flex items-center gap-1 justify-end">
            <span className="text-xs text-muted-foreground">$</span>
            <input
              type="number"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") { setEditValue((row.budgeted / 100).toString()); setEditing(false); }
              }}
              min={0}
              step={10}
              autoFocus
              className="w-20 rounded border border-border bg-background px-2 py-0.5 text-sm tabular-nums"
            />
            <button onClick={handleSave} disabled={saving} className="text-emerald-600 p-0.5">
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <span className="text-sm font-medium tabular-nums">{formatCurrency(row.budgeted)}</span>
        )}
      </div>

      <div className="col-span-2 text-right">
        <span className={`text-sm font-medium tabular-nums ${isBlown ? "text-red-500" : ""}`}>
          {formatCurrency(row.spent)}
        </span>
        <MoMDelta currentSpent={row.spent} prevMonthSpent={row.prevMonthSpent} />
      </div>

      <div className="col-span-3 space-y-1">
        <Progress value={Math.min(row.percentUsed, 100)} className={`h-1.5 ${barClass}`} />
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground tabular-nums">{row.percentUsed}%</span>
          <span className={`tabular-nums ${isBlown ? "text-red-500 font-medium" : "text-emerald-600"}`}>
            {isBlown ? `over ${formatCurrency(overage)}` : `${formatCurrency(row.remaining)} left`}
          </span>
        </div>
      </div>

      <div className="col-span-1 flex items-center justify-end gap-0.5">
        {!editing && (
          <>
            <button onClick={() => setEditing(true)} className="text-muted-foreground hover:text-foreground p-1" title="Edit budget">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={handleDelete} className="text-muted-foreground hover:text-red-500 p-1" title="Remove budget">
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function UnbudgetedRowDisplay({ row }: { row: UnbudgetedRow }) {
  const [setting, setSetting] = useState(false);
  const [editValue, setEditValue] = useState((row.suggestedBudgetCents / 100).toString());
  const [saving, setSaving] = useState(false);
  const [hiding, setHiding] = useState(false);
  const router = useRouter();

  const handleSet = async () => {
    const dollars = parseFloat(editValue);
    if (isNaN(dollars) || dollars < 0) return;
    setSaving(true);
    await apiFetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: row.categoryId, amount: dollars }),
    });
    setSaving(false);
    setSetting(false);
    router.refresh();
  };

  const handleHide = async () => {
    setHiding(true);
    await apiFetch("/api/categories/hide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryName: row.categoryName }),
    });
    setHiding(false);
    router.refresh();
  };

  return (
    <div
      id={`budget-row-${row.categoryId}`}
      className="budget-row grid grid-cols-12 gap-3 items-center py-2 px-3 rounded-md border border-dashed border-border/60 bg-muted/20 hover:bg-accent/20 transition-colors"
    >
      <div className="col-span-4 flex items-center gap-2 min-w-0">
        <span className="w-2 h-2 rounded-full shrink-0 opacity-50" style={{ backgroundColor: row.categoryColor }} />
        <Link
          href={`/transactions?category=${row.categoryId}&range=3-months`}
          className="text-sm truncate text-muted-foreground hover:text-foreground hover:underline decoration-dotted underline-offset-2"
          title={`View ${row.categoryName} transactions`}
        >
          {row.categoryName}
        </Link>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground/70 shrink-0 uppercase tracking-wider">
          unbudgeted
        </span>
      </div>

      <div className="col-span-2 text-right">
        <span className="text-sm text-muted-foreground tabular-nums">—</span>
      </div>

      <div className="col-span-2 text-right">
        <span className="text-sm font-medium tabular-nums">{formatCurrency(row.spent)}</span>
        {row.spentMtd > 0 && (
          <p className="text-[10px] text-muted-foreground">{formatCurrency(row.spentMtd)} MTD</p>
        )}
        <MoMDelta currentSpent={row.spentMtd} prevMonthSpent={row.prevMonthSpent} />
      </div>

      <div className="col-span-3 flex items-center">
        {setting ? (
          <div className="flex items-center gap-1 w-full">
            <span className="text-xs text-muted-foreground">$</span>
            <input
              type="number"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSet();
                if (e.key === "Escape") setSetting(false);
              }}
              min={0}
              step={10}
              autoFocus
              className="flex-1 rounded border border-border bg-background px-2 py-0.5 text-sm tabular-nums"
            />
            <Button size="sm" onClick={handleSet} disabled={saving} className="h-6 text-[10px]">
              {saving ? "..." : "Set"}
            </Button>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Trailing 30d spend · 0% covered
          </p>
        )}
      </div>

      <div className="col-span-1 flex items-center justify-end gap-1">
        {!setting && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSetting(true)}
              className="h-6 text-[10px] px-2"
              title={`Suggested: ${formatCurrency(row.suggestedBudgetCents)}/mo`}
            >
              Set budget
            </Button>
            <button
              onClick={handleHide}
              disabled={hiding}
              className="text-muted-foreground hover:text-foreground p-1 disabled:opacity-50"
              title="Hide this category from unbudgeted rows (won't affect totals)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function TotalsFooter({ rows, unbudgetedRows }: { rows: BudgetRow[]; unbudgetedRows: UnbudgetedRow[] }) {
  const totalBudgeted = rows.reduce((s, r) => s + r.budgeted, 0);
  const totalSpentMtd = rows.reduce((s, r) => s + r.spent, 0);
  const totalRemaining = totalBudgeted - totalSpentMtd;
  const pctUsed = totalBudgeted > 0 ? Math.round((totalSpentMtd / totalBudgeted) * 100) : 0;
  const totalUnbudgetedSpend = unbudgetedRows.reduce((s, r) => s + r.spent, 0);
  const totalUnbudgetedMtd = unbudgetedRows.reduce((s, r) => s + r.spentMtd, 0);

  const isOver = pctUsed > 100;
  const isWarn = pctUsed > 80 && !isOver;
  const barClass = isOver ? "[&>div]:bg-red-500" : isWarn ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500";

  return (
    <div className="border-t-2 border-border pt-3">
      <div className="grid grid-cols-12 gap-3 items-center py-2 px-3 rounded-md bg-muted/30">
        <div className="col-span-4 flex items-center gap-2">
          <p className="text-sm font-semibold tracking-tight">All budgeted categories</p>
        </div>
        <div className="col-span-2 text-right">
          <span className="text-sm font-bold tabular-nums">{formatCurrency(totalBudgeted)}</span>
          <p className="text-[10px] text-muted-foreground">total budget</p>
        </div>
        <div className="col-span-2 text-right">
          <span className={`text-sm font-bold tabular-nums ${isOver ? "text-red-500" : ""}`}>{formatCurrency(totalSpentMtd)}</span>
          <p className="text-[10px] text-muted-foreground">spent MTD</p>
        </div>
        <div className="col-span-3 space-y-1">
          <Progress value={Math.min(pctUsed, 100)} className={`h-1.5 ${barClass}`} />
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground tabular-nums">{pctUsed}%</span>
            <span className={`tabular-nums font-medium ${isOver ? "text-red-500" : "text-emerald-600"}`}>
              {isOver ? `over ${formatCurrency(Math.abs(totalRemaining))}` : `${formatCurrency(totalRemaining)} left`}
            </span>
          </div>
        </div>
        <div className="col-span-1" />
      </div>

      {unbudgetedRows.length > 0 && (
        <div className="grid grid-cols-12 gap-3 items-center py-2 px-3 mt-1 text-muted-foreground">
          <div className="col-span-4">
            <p className="text-sm">Unbudgeted spend</p>
          </div>
          <div className="col-span-2 text-right">
            <span className="text-sm tabular-nums">—</span>
          </div>
          <div className="col-span-2 text-right">
            <span className="text-sm tabular-nums">{formatCurrency(totalUnbudgetedMtd)}</span>
            <p className="text-[10px]">MTD</p>
          </div>
          <div className="col-span-3">
            <p className="text-[11px]">{formatCurrency(totalUnbudgetedSpend)} trailing-30d across {unbudgetedRows.length} categor{unbudgetedRows.length === 1 ? "y" : "ies"}</p>
          </div>
          <div className="col-span-1" />
        </div>
      )}
    </div>
  );
}

function AddBudgetInline({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false);
  const [selectedCat, setSelectedCat] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const handleAdd = async () => {
    if (!selectedCat || !amount) return;
    const dollars = parseFloat(amount);
    if (isNaN(dollars) || dollars <= 0) return;
    setSaving(true);
    await apiFetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: selectedCat, amount: dollars }),
    });
    setSaving(false);
    setOpen(false);
    setSelectedCat("");
    setAmount("");
    router.refresh();
  };

  if (categories.length === 0 && !open) {
    return null; // every category with spend already has a row
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors py-3 px-3 rounded-md border border-dashed border-border"
      >
        <Plus className="w-3.5 h-3.5" />
        Add budget for a category with no recent spend ({categories.length})
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 py-3 px-3 rounded-md border border-border bg-accent/20">
      <select
        value={selectedCat}
        onChange={(e) => setSelectedCat(e.target.value)}
        className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-sm"
      >
        <option value="">Select category...</option>
        {categories.map((cat) => (
          <option key={cat.id} value={cat.id}>
            {cat.groupName ? `${cat.groupName} → ` : ""}{cat.name}
          </option>
        ))}
      </select>
      <Input
        type="number"
        placeholder="$ amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-28"
        min={0}
        step={50}
      />
      <Button size="sm" onClick={handleAdd} disabled={saving || !selectedCat || !amount} className="h-8 text-xs">
        {saving ? "..." : "Add"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)} className="h-8 text-xs">
        Cancel
      </Button>
    </div>
  );
}

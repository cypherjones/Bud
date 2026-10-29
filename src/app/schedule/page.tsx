import Link from "next/link";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { PlanPage, SectionHead, TotalsStrip, Total, Aside } from "@/components/plan/plan-ui";
import { monthlizeRecurring } from "@/lib/actions/dashboard";
import { rollRecurringForward } from "@/lib/actions/recurring";
import { getCyclePayments, daysBetween } from "@/lib/debts/payments";
import { formatCurrency, formatCurrencyCompact, today as todayIso } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const day = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const short = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const FREQ: Record<string, string> = { weekly: "weekly", biweekly: "every 2 weeks", monthly: "monthly", yearly: "yearly", one_time: "once" };

type Row = {
  id: string;
  merchant: string;
  amount: number;
  frequency: string;
  nextDueDate: string | null;
  lastSeenDate: string | null;
  category: string | null;
  group: string | null;
};

export default function SchedulePage() {
  rollRecurringForward();
  const today = todayIso();
  const rows: Row[] = db
    .select({
      id: schema.recurringTransactions.id,
      merchant: schema.recurringTransactions.merchant,
      amount: schema.recurringTransactions.amount,
      frequency: schema.recurringTransactions.frequency,
      nextDueDate: schema.recurringTransactions.nextDueDate,
      lastSeenDate: schema.recurringTransactions.lastSeenDate,
      category: schema.categories.name,
      group: schema.categoryGroups.name,
    })
    .from(schema.recurringTransactions)
    .leftJoin(schema.categories, eq(schema.recurringTransactions.categoryId, schema.categories.id))
    .leftJoin(schema.categoryGroups, eq(schema.categories.groupId, schema.categoryGroups.id))
    .where(eq(schema.recurringTransactions.isActive, true))
    .all()
    .filter((r) => r.group !== "Internal")
    .sort((a, b) => (a.nextDueDate ?? "9").localeCompare(b.nextDueDate ?? "9"));

  const income = rows.filter((r) => r.group === "Income");
  const bills = rows.filter((r) => r.group !== "Income");
  const monthlyIn = income.reduce((s, r) => s + monthlizeRecurring(r.amount, r.frequency), 0);
  const monthlyOut = bills.reduce((s, r) => s + monthlizeRecurring(r.amount, r.frequency), 0);
  const week = bills.filter((r) => r.nextDueDate && daysBetween(today, r.nextDueDate) >= 0 && daysBetween(today, r.nextDueDate) <= 7);
  const unseen = rows.filter((r) => !r.lastSeenDate && r.frequency !== "one_time");
  const late = getCyclePayments(today).filter((c) => c.state !== "paid" && c.daysLate > 0);

  // Bills by group, biggest monthly first.
  const groups = new Map<string, Row[]>();
  for (const r of bills) groups.set(r.group ?? "Other", [...(groups.get(r.group ?? "Other") ?? []), r]);
  const grouped = [...groups].sort(
    (a, b) => b[1].reduce((s, r) => s + monthlizeRecurring(r.amount, r.frequency), 0) - a[1].reduce((s, r) => s + monthlizeRecurring(r.amount, r.frequency), 0),
  );

  return (
    <PlanPage
      title="Schedule"
      sub={
        <>
          Every bill and paycheck with a date, and when the bank last saw it. Dates move forward on their own once a charge posts. The
          day-by-day cash walk is on <Link href="/next" className="underline decoration-dotted underline-offset-2">Next month</Link>.
        </>
      }
    >
      <TotalsStrip cols={4}>
        <Total label="Coming in a month" value={formatCurrencyCompact(monthlyIn)} note={`${income.length} paychecks and shares`} />
        <Total label="Bills a month" value={formatCurrencyCompact(monthlyOut)} note="Dated bills only; one-time payments not included" />
        <Total
          label="Next 7 days"
          value={formatCurrencyCompact(week.reduce((s, r) => s + r.amount, 0))}
          note={`${week.length} ${week.length === 1 ? "bill" : "bills"}`}
        />
        <Total
          label="Never seen in the bank"
          value={String(unseen.length)}
          note={unseen.length ? "Plan figures that haven't posted from a synced account yet" : "Every row has posted at least once"}
          tone={unseen.length ? "text-amber-400" : undefined}
        />
      </TotalsStrip>

      {late.length > 0 && (
        <Aside tone="warn" title="Late">
          {late.map((c) => (
            <p key={c.scheduleId}>
              {c.name}, {formatCurrency(c.amount)} due {short(c.dueDate)}:{" "}
              {c.state === "scheduled" ? `scheduled ${short(c.scheduledOn!)}` : "no payment in any synced account"}.
            </p>
          ))}
        </Aside>
      )}

      <section className="space-y-3">
        <SectionHead title="Coming in" />
        <ScheduleList rows={income} today={today} />
      </section>

      {grouped.map(([group, list]) => (
        <section key={group} className="space-y-3">
          <SectionHead
            title={group}
            sub={`${formatCurrency(list.reduce((s, r) => s + monthlizeRecurring(r.amount, r.frequency), 0))} a month`}
          />
          <ScheduleList rows={list} today={today} />
        </section>
      ))}
    </PlanPage>
  );
}

function ScheduleList({ rows, today }: { rows: Row[]; today: string }) {
  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-card">
      {rows.map((r) => {
        const soon = r.nextDueDate && daysBetween(today, r.nextDueDate) <= 1;
        return (
          <div key={r.id} className="flex items-baseline gap-x-3 px-4 py-2.5 text-sm">
            <div className="flex-1 min-w-0">
              <p className="truncate">{r.merchant}</p>
              <p className="text-xs text-muted-foreground">
                {FREQ[r.frequency] ?? r.frequency}
                {r.category && ` · ${r.category}`}
                {r.lastSeenDate ? ` · last seen ${short(r.lastSeenDate)}` : r.frequency === "one_time" ? "" : " · not seen in the bank yet"}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-mono tabular-nums">{formatCurrency(r.amount)}</p>
              <p className={cn("text-xs", soon ? "text-amber-400" : "text-muted-foreground")}>
                {r.nextDueDate ? (r.nextDueDate === today ? "today" : day(r.nextDueDate)) : "no date"}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

import Link from "next/link";
import { PlanPage, TotalsStrip, Total } from "@/components/plan/plan-ui";
import { SubscriptionManager } from "@/components/subscriptions/subscription-manager";
import { getSubscriptionsView } from "@/lib/subscriptions/view";
import { DONE, RUNNING, TO_DO, monthlyCents, yourMonthlyCents, type SubRow } from "@/lib/subscriptions/model";
import { formatCurrencyCompact } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

const live = (r: SubRow) => RUNNING.includes(r.entry.status) && !r.looksStopped;
const sum = (rows: SubRow[], f: (r: SubRow) => number) => rows.reduce((s, r) => s + f(r), 0);

export default function SubscriptionsPage() {
  const view = getSubscriptionsView();
  const all = [...view.apple, ...view.direct];
  const running = all.filter(live);
  const toDo = all.filter((r) => TO_DO.includes(r.entry.status) && !r.looksStopped);
  const done = all.filter((r) => DONE.includes(r.entry.status));
  const unclaimed = view.appleUnclaimed.filter((r) => !r.looksStopped);
  const budgeted = view.budgetLines.reduce((s, l) => s + l.cents, 0);

  const yours = sum(running, (r) => yourMonthlyCents(r.entry));
  const unclaimedMonthly = sum(unclaimed, (r) => r.entry.amount);

  return (
    <PlanPage
      title="Subscription management"
      sub={
        <>
          Every subscription in one place: the Apple ones billed together as &ldquo;Apple&rdquo;, and everything billed directly.
          Mark what to keep, cancel or hand off, and Bud checks the bank to confirm it actually stopped.
        </>
      }
    >
      <TotalsStrip cols={5}>
        <Total
          label="You pay a month"
          value={formatCurrencyCompact(yours)}
          note={
            <>
              {running.length} running, after shared costs.{" "}
              {budgeted > 0 && (
                <Link href="/budget" className="underline decoration-dotted underline-offset-2">
                  Budget: {formatCurrencyCompact(budgeted)}
                </Link>
              )}
            </>
          }
        />
        <Total
          label="Apple"
          value={formatCurrencyCompact(sum(view.apple.filter(live), (r) => monthlyCents(r.entry)))}
          note={`${view.apple.filter(live).length} on the list`}
        />
        <Total
          label="To act on"
          value={formatCurrencyCompact(sum(toDo, (r) => monthlyCents(r.entry)))}
          note={toDo.length === 0 ? "Nothing waiting" : `${toDo.length} to cancel or hand off`}
          tone={toDo.length > 0 ? "text-amber-400" : undefined}
        />
        <Total
          label="Cut so far"
          value={formatCurrencyCompact(sum(done, (r) => monthlyCents(r.entry)))}
          note={`${done.length} cancelled or handed off`}
          tone={done.length > 0 ? "text-emerald-400" : undefined}
        />
        <Total
          label="Apple, not on the list"
          value={formatCurrencyCompact(unclaimedMonthly)}
          note={unclaimed.length === 0 ? "Every Apple charge is named" : `${unclaimed.length} amounts still billing`}
          tone={unclaimed.length > 0 ? "text-amber-400" : undefined}
        />
      </TotalsStrip>

      <SubscriptionManager view={view} />
    </PlanPage>
  );
}

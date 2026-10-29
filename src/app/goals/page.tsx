import Link from "next/link";
import { PlanPage, SectionHead, TotalsStrip, Total, Aside } from "@/components/plan/plan-ui";
import { LinkContributionDialog } from "@/components/goals/link-contribution-dialog";
import { DeleteGoalButton } from "@/components/goals/delete-goal-button";
import { getSavingsView, type ActiveGoal, type SavingsView } from "@/lib/actions/goals-view";
import type { AccountBalance } from "@/lib/actions/balances";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const day = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const dayYear = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const link = "underline decoration-dotted underline-offset-2";
const MOVES_SHOWN = 20;

/** "1 day", "3 weeks", "1.4 months" — whichever reads naturally. */
function coverage(months: number): string {
  const days = Math.round(months * 30.4);
  if (days < 14) return `${days} ${days === 1 ? "day" : "days"}`;
  if (months < 1) return `${Math.round(days / 7)} weeks`;
  return `${months.toFixed(1)} months`;
}

export default function SavingsPage() {
  const v = getSavingsView();
  const buffer = v.planSpendCents;
  const short = Math.max(0, buffer - v.savingsCents);
  const neededPerMonth = v.goals.reduce((s, g) => s + (g.perMonthCents ?? 0), 0);
  const gap = neededPerMonth - v.planSetAsideCents;

  return (
    <PlanPage
      title="Savings"
      sub={
        <>
          What&apos;s in savings today, measured against the household plan on{" "}
          <Link href="/budget" className={link}>Budget</Link>. A goal shows what it needs each month to land on its date.
        </>
      }
    >
      <TotalsStrip cols={4}>
        <Total
          label="In savings now"
          value={formatCurrency(v.savingsCents)}
          note={`across ${v.accounts.length} ${v.accounts.length === 1 ? "account" : "accounts"}`}
          tone={v.savingsCents < buffer ? "text-amber-400" : "text-emerald-400"}
        />
        <Total
          label="Plan sets aside"
          value={`${formatCurrencyCompact(v.planSetAsideCents)}/mo`}
          note={v.planSetAsideCents === 0 ? "Nothing yet. Set it on Budget." : "into savings, on Budget"}
          tone={v.planSetAsideCents === 0 ? "text-amber-400" : undefined}
          href="/budget"
        />
        <Total
          label="Months covered"
          value={v.monthsCovered === null ? "—" : v.monthsCovered < 0.1 ? v.monthsCovered.toFixed(2) : v.monthsCovered.toFixed(1)}
          note={v.monthsCovered === null ? "The plan has no spending lines" : `about ${coverage(v.monthsCovered)} of plan spending`}
          tone={v.monthsCovered !== null && v.monthsCovered < 1 ? "text-amber-400" : undefined}
        />
        <Total
          label="Buffer goal"
          value={formatCurrencyCompact(buffer)}
          note={short > 0 ? `one month of plan spending. ${formatCurrencyCompact(short)} to go.` : "one month of plan spending. Covered."}
        />
      </TotalsStrip>

      <section className="space-y-3">
        <SectionHead title="Accounts" sub="Savings accounts that are syncing and counted. The same numbers as Balances." />
        <AccountTable rows={v.accounts} total={v.savingsCents} />
        {v.notCounted.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Left out: {v.notCounted.map((a) => `${a.name} (${a.syncing ? "excluded from totals" : "feed stopped"})`).join(", ")}.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <SectionHead
          title="Goals"
          sub="Per month is what's left to save divided by the whole months until the date. The total is checked against what the plan sets aside."
        />
        {v.goals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active goals. Tell Bud in Chat what you&apos;re saving for and it will add one.</p>
        ) : (
          <GoalTable goals={v.goals} view={v} neededPerMonth={neededPerMonth} />
        )}
        {v.goals.length > 0 && gap > 0 && (
          <Aside tone="warn" title="The plan doesn't fund these dates">
            Landing every goal on its date takes {formatCurrency(neededPerMonth)} a month into savings. The plan sets aside{" "}
            {formatCurrency(v.planSetAsideCents)}. Raise &ldquo;Into savings, per month&rdquo; on{" "}
            <Link href="/budget" className={link}>Budget</Link>, or move the dates.
          </Aside>
        )}
        {v.oldGoals.length > 0 && <OldGoals view={v} />}
      </section>

      <section className="space-y-3">
        <SectionHead
          title="Recent moves in and out of savings"
          sub={
            <>
              Since {day(v.movesSince)}: {formatCurrency(v.inCents)} went in and {formatCurrency(v.outCents)} came back out.
            </>
          }
        />
        <MovesTable view={v} />
      </section>
    </PlanPage>
  );
}

function AccountTable({ rows, total }: { rows: AccountBalance[]; total: number }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No savings accounts are syncing.</p>;
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="py-1 pr-3 text-left font-semibold">Account</th>
            <th className="py-1 pl-3 text-right font-semibold">Balance</th>
            <th className="py-1 pl-3 text-right font-semibold">Last activity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="border-b border-border last:border-b-0">
              <td className="py-1.5 pr-3">{a.name}</td>
              <td className={cn("py-1.5 pl-3 text-right font-mono tabular-nums whitespace-nowrap", a.balanceCents < 0 && "text-red-400")}>
                {formatCurrency(a.balanceCents)}
              </td>
              <td className="py-1.5 pl-3 text-right whitespace-nowrap text-[13px] text-muted-foreground">
                {a.lastActivity ? (a.daysQuiet === 0 ? "today" : a.daysQuiet === 1 ? "yesterday" : `${day(a.lastActivity)} · ${a.daysQuiet}d`) : "none"}
              </td>
            </tr>
          ))}
          {rows.length > 1 && (
            <tr className="font-semibold">
              <td className="pt-2 pr-3 border-t border-border">Total</td>
              <td className="pt-2 pl-3 text-right font-mono tabular-nums border-t border-border">{formatCurrency(total)}</td>
              <td className="border-t border-border" />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function byDate(g: ActiveGoal): string {
  if (!g.targetDate) return "no date";
  if (g.pastDue) return `${dayYear(g.targetDate)}, passed`;
  return `${dayYear(g.targetDate)}${g.monthsLeft !== null ? ` · ${g.monthsLeft} mo` : ""}`;
}

function GoalTable({ goals, view, neededPerMonth }: { goals: ActiveGoal[]; view: SavingsView; neededPerMonth: number }) {
  const th = "py-1 pl-3 text-right font-semibold";
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="py-1 pr-3 text-left font-semibold">Goal</th>
            <th className={th}>Target</th>
            <th className={cn(th, "hidden sm:table-cell")}>Saved</th>
            <th className={cn(th, "hidden sm:table-cell")}>By</th>
            <th className={th}>Per month</th>
          </tr>
        </thead>
        <tbody>
          {goals.map((g) => (
            <tr key={g.id} className="border-b border-border last:border-b-0 align-top">
              <td className="py-2 pr-3">
                <p className="font-medium leading-snug">{g.name}</p>
                <p className="sm:hidden text-[11px] text-muted-foreground">
                  {formatCurrency(g.savedCents)} saved · by {byDate(g)}
                </p>
                {g.savedFrom === "savings" ? (
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    One month of plan spending, so it follows the plan. Everything in savings counts toward it
                    {g.storedTargetCents !== null && <>. The {formatCurrencyCompact(g.storedTargetCents)} saved on the goal is an old spending average and isn&apos;t used</>}.
                  </p>
                ) : (
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span>
                      {g.contributions.length === 0
                        ? "No deposits linked yet."
                        : `${g.contributions.length} linked, latest ${day(g.contributions[0].date)}.`}
                    </span>
                    <LinkContributionDialog goalId={g.id} goalName={g.name} candidates={view.linkable} />
                  </div>
                )}
              </td>
              <td className="py-2 pl-3 text-right font-mono tabular-nums whitespace-nowrap">{formatCurrencyCompact(g.targetCents)}</td>
              <td className="hidden sm:table-cell py-2 pl-3 text-right font-mono tabular-nums whitespace-nowrap">{formatCurrency(g.savedCents)}</td>
              <td className={cn("hidden sm:table-cell py-2 pl-3 text-right whitespace-nowrap text-[13px]", g.pastDue ? "text-red-400" : "text-muted-foreground")}>
                {byDate(g)}
              </td>
              <td
                className={cn(
                  "py-2 pl-3 text-right font-mono tabular-nums whitespace-nowrap",
                  g.perMonthCents !== null && g.perMonthCents > view.planSetAsideCents && "text-amber-400",
                )}
              >
                {g.perMonthCents === null ? (g.pastDue ? "date passed" : "—") : formatCurrencyCompact(g.perMonthCents)}
              </td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="pt-2 pr-3 border-t border-border">Needed a month</td>
            <td className="pt-2 border-t border-border" />
            <td className="hidden sm:table-cell border-t border-border" />
            <td className="hidden sm:table-cell border-t border-border" />
            <td className="pt-2 pl-3 text-right font-mono tabular-nums border-t border-border">{formatCurrencyCompact(neededPerMonth)}</td>
          </tr>
          <tr className="text-muted-foreground">
            <td className="py-1 pr-3">
              Plan sets aside, on <Link href="/budget" className={link}>Budget</Link>
            </td>
            <td />
            <td className="hidden sm:table-cell" />
            <td className="hidden sm:table-cell" />
            <td
              className={cn(
                "py-1 pl-3 text-right font-mono tabular-nums",
                view.planSetAsideCents < neededPerMonth ? "text-amber-400" : "text-emerald-400",
              )}
            >
              {formatCurrencyCompact(view.planSetAsideCents)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function OldGoals({ view }: { view: SavingsView }) {
  return (
    <details className="group rounded-xl border border-border bg-card">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
        Old goals ({view.oldGoals.length})
        <span className="ml-2 font-normal text-muted-foreground">Left out of everything above. Delete the ones you&apos;re done with.</span>
      </summary>
      <ul className="divide-y divide-border border-t border-border">
        {view.oldGoals.map((g) => (
          <li key={g.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
            <div className="flex-1 min-w-[200px]">
              <p className="font-medium leading-snug">
                {g.name}
                <span className="ml-2 text-xs font-mono tabular-nums text-muted-foreground">
                  {g.targetCents > 0 ? `${formatCurrencyCompact(g.savedCents)} of ${formatCurrencyCompact(g.targetCents)}` : "no target"}
                </span>
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground leading-snug">{g.reason}</p>
            </div>
            <DeleteGoalButton goalId={g.id} goalName={g.name} />
          </li>
        ))}
      </ul>
    </details>
  );
}

function MovesTable({ view }: { view: SavingsView }) {
  if (view.moves.length === 0) return <p className="text-sm text-muted-foreground">Nothing moved in or out of savings in the last 90 days.</p>;
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="py-1 pr-3 text-left font-semibold">Date</th>
            <th className="py-1 pr-3 text-left font-semibold">Account</th>
            <th className="py-1 pl-3 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {view.moves.slice(0, MOVES_SHOWN).map((m) => (
            <tr key={m.id} className={cn("border-b border-border last:border-b-0", m.direction === "out" && "text-muted-foreground")}>
              <td className="py-1.5 pr-3 whitespace-nowrap text-[13px] text-muted-foreground">{day(m.date)}</td>
              <td className="py-1.5 pr-3">
                {m.accountName}
                <span className="block text-[11px] text-muted-foreground">
                  {m.description}
                  {m.linkedGoalName && <> · linked to {m.linkedGoalName}</>}
                </span>
              </td>
              <td className={cn("py-1.5 pl-3 text-right font-mono tabular-nums whitespace-nowrap", m.direction === "in" && "text-emerald-400")}>
                {m.direction === "in" ? "+" : "−"}
                {formatCurrency(m.cents)}
              </td>
            </tr>
          ))}
          {view.moves.length > MOVES_SHOWN && (
            <tr>
              <td colSpan={3} className="pt-2 text-[11px] text-muted-foreground">
                {view.moves.length - MOVES_SHOWN} older moves since {day(view.movesSince)} are counted above but not listed.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

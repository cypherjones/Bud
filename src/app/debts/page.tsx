import Link from "next/link";
import { PlanPage, SectionHead, TotalsStrip, Total, Aside } from "@/components/plan/plan-ui";
import { LogPaymentDialog } from "@/components/debts/log-payment-dialog";
import { AddDebtDialog } from "@/components/debts/add-debt-dialog";
import { EditDebtDialog } from "@/components/debts/edit-debt-dialog";
import { DeleteDebtButton } from "@/components/debts/delete-debt-button";
import { getDebtsPicture, type LoanRow } from "@/lib/debts/picture";
import type { CyclePayment } from "@/lib/debts/payments";
import { logSeenDebtPayments } from "@/lib/debts/seen-payments";
import { rollRecurringForward } from "@/lib/actions/recurring";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const day = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const monthYear = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
const pct = (r: number) => `${(r * 100).toFixed(2).replace(/\.?0+$/, "")}%`;

function cycleText(c: CyclePayment): { text: string; tone: "good" | "warn" | "bad" } {
  if (c.state === "paid") return { text: `Paid ${day(c.paidOn!)}`, tone: "good" };
  const late = c.daysLate > 0 ? `${c.daysLate} days late` : `Due ${day(c.dueDate)}`;
  const report = c.reportsLateOn ? `, reports late ${day(c.reportsLateOn)}` : "";
  if (c.state === "scheduled") return { text: `${late}, paying ${c.scheduledOn === c.dueDate ? "on time" : day(c.scheduledOn!)}${report}`, tone: "warn" };
  return { text: `${late}, no payment seen${report}`, tone: c.daysLate > 0 ? "bad" : "warn" };
}

const TONE = { good: "text-emerald-400", warn: "text-amber-400", bad: "text-red-400" };

export default function DebtsPage() {
  rollRecurringForward();
  logSeenDebtPayments();
  const p = getDebtsPicture();
  const open = p.cycles.filter((c) => c.state !== "paid" && c.daysLate > 0);

  return (
    <PlanPage
      title="Debts"
      sub={
        <>
          What&apos;s owed and this month&apos;s payments. Payments come from the{" "}
          <Link href="/budget" className="underline decoration-dotted underline-offset-2">budget</Link>; loan balances move with each
          payment Bud sees in the bank.
        </>
      }
      actions={<AddDebtDialog />}
    >
      <TotalsStrip cols={4}>
        <Total label="Owed now" value={formatCurrencyCompact(p.totals.owed)} note={`${[...p.loans.map((l) => l.planLine?.label.replace(/^auto loan\s*[—-]\s*/i, "") ?? l.debt.creditorName), ...p.planDebts.filter((d) => d.balance).map((d) => d.label)].join(", ")}${p.unpaid.length ? `; not counting ${p.unpaid.map((u) => u.debt.creditorName).join(", ")}` : ""}`} />
        <Total label="Paid each month" value={formatCurrencyCompact(p.totals.monthly)} note="The budget's debt lines" href="/budget" />
        <Total label="Interest a month" value={formatCurrencyCompact(p.totals.interestMonthly)} note="At today's balances; IRS interest not included" />
        <Total
          label="Debt-free"
          value={p.totals.debtFree ? p.totals.debtFree.month : "—"}
          note={p.totals.debtFree ? `${p.totals.debtFree.months} months at the budget's payments, each freed payment rolling to the next` : "Payments don't cover the interest"}
        />
      </TotalsStrip>

      {open.length > 0 && (
        <Aside tone="warn" title="Late this month">
          {open.map((c) => (
            <p key={c.scheduleId}>
              <span className="text-foreground font-medium">{c.name}</span>, {formatCurrency(c.amount)} due {day(c.dueDate)}:{" "}
              {c.state === "scheduled"
                ? `scheduled ${day(c.scheduledOn!)}.`
                : "no payment in any synced account."}
              {c.reportsLateOn && ` The lender reports it late if it isn't paid by ${day(c.reportsLateOn)}.`}
              {/irs/i.test(c.name) && " A missed installment can put the agreement in default; check your IRS online account."}
            </p>
          ))}
        </Aside>
      )}

      <section className="space-y-3">
        <SectionHead title="This month" sub="Each debt payment on the schedule, checked against the bank." />
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {[...p.cycles].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((c) => {
            const s = cycleText(c);
            return (
              <div key={c.scheduleId} className="flex items-baseline gap-x-3 px-4 py-2.5 text-sm">
                <span className="w-12 shrink-0 text-muted-foreground">{day(c.dueDate)}</span>
                <div className="flex-1 min-w-0">
                  <p>{c.name}</p>
                  <p className={cn("text-xs", TONE[s.tone])}>{s.text}</p>
                </div>
                <span className="font-mono tabular-nums">{formatCurrency(c.amount)}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHead title="Loans" sub="Balances Bud tracks. Update one from the lender's site with Edit and the estimate starts from there." />
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {p.loans.map((r) => (
            <LoanItem key={r.debt.id} r={r} />
          ))}
        </div>
      </section>

      {p.planDebts.length > 0 && (
        <section className="space-y-3">
          <SectionHead title="Also in the budget" sub="Debts the budget pays that aren't tracked as loans here." />
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {p.planDebts.map((d) => (
              <div key={d.label} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3">
                <div className="flex-1 min-w-[200px]">
                  <p className="font-medium">{d.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.balance !== null ? `${formatCurrency(d.balance)} owed` : "Balance not tracked"}
                    {d.note ? ` · ${d.note}` : d.balance !== null ? ` · ${d.balanceNote}` : ""}
                  </p>
                </div>
                <p className="font-mono tabular-nums text-sm">
                  {formatCurrency(d.monthly)}
                  <span className="text-xs text-muted-foreground">/mo</span>
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {p.payoffOrder.length > 1 && (
        <section className="space-y-3">
          <SectionHead
            title="Paying it down"
            sub="At the budget's payments, with each finished debt's payment moved to the next highest rate."
          />
          <ol className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
            {p.payoffOrder.map((o, i) => (
              <li key={o.name} className="flex items-baseline gap-3 px-4 py-2.5">
                <span className="w-5 text-muted-foreground">{i + 1}</span>
                <span className="flex-1">{o.name}</span>
                <span className="font-mono tabular-nums text-muted-foreground">paid off {o.month}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {p.unpaid.length > 0 && (
        <section className="space-y-3">
          <SectionHead title="Not being paid" sub="No line in the budget and no payment in two months. Left out of the totals above." />
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {p.unpaid.map((r) => (
              <div key={r.debt.id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <p className="font-medium">{r.debt.creditorName}</p>
                  <p className="font-mono tabular-nums text-sm">{formatCurrency(r.debt.currentBalance)}</p>
                </div>
                <p className="mt-0.5 text-sm text-red-400">
                  {r.lastPayment ? `Last payment ${day(r.lastPayment.date)}.` : "No payment in any synced account."} The balance is from{" "}
                  {monthYear(r.debt.updatedAt.slice(0, 10))}. See where it stands on{" "}
                  <Link href="/credit" className="underline decoration-dotted underline-offset-2">Credit</Link>.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <EditDebtDialog debt={r.debt} />
                  <DeleteDebtButton debtId={r.debt.id} creditorName={r.debt.creditorName} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {p.paidOff.length > 0 && (
        <section className="space-y-3">
          <SectionHead title="Paid off" />
          <div className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
            {p.paidOff.map(({ debt, paidOn }) => (
              <div key={debt.id} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                <span>{debt.creditorName}</span>
                <span className="text-emerald-400">{paidOn ? `Paid off ${day(paidOn)}` : "Paid off"}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </PlanPage>
  );
}

function LoanItem({ r }: { r: LoanRow }) {
  const d = r.debt;
  const s = r.cycle ? cycleText(r.cycle) : null;
  const pay = r.planLine?.amount ?? d.minimumPayment;
  const pastContract = r.contractEnd && r.payoff && (() => {
    const end = new Date(r.contractEnd + "T00:00:00");
    const now = new Date();
    return (end.getFullYear() - now.getFullYear()) * 12 + end.getMonth() - now.getMonth() < r.payoff.months;
  })();
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
        <div className="flex-1 min-w-[200px]">
          <p className="font-medium">
            {d.creditorName}
            {r.planLine && <span className="ml-2 text-xs font-normal text-muted-foreground">{r.planLine.label.replace(/^auto loan\s*[—-]\s*/i, "")}</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {pct(d.interestRate)} APR · {formatCurrency(pay)}/mo{d.dueDay ? ` due the ${d.dueDay}th` : ""}
            {r.payoff ? ` · paid off ${r.payoff.month} at this payment` : " · this payment doesn't cover the interest"}
          </p>
          {s && <p className={cn("text-xs mt-0.5", TONE[s.tone])}>This month: {s.text}</p>}
          {pastContract && (
            <p className="text-xs mt-0.5 text-amber-400">
              The contract&apos;s last payment is {monthYear(r.contractEnd!)}, so at this pace a lump sum is left at the end. Ask the lender for the payoff schedule.
            </p>
          )}
          {r.planLine?.note && !/balance about/i.test(r.planLine.note) && <p className="text-xs mt-0.5 text-muted-foreground italic">{r.planLine.note}</p>}
        </div>
        <div className="text-right">
          <p className="font-mono tabular-nums">
            {formatCurrency(d.currentBalance)}
            {r.estimated && <span className="ml-1 text-[11px] text-muted-foreground">est.</span>}
          </p>
          {r.lastPayment && <p className="text-xs text-muted-foreground">after the {day(r.lastPayment.date)} payment</p>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <LogPaymentDialog debtId={d.id} creditorName={d.creditorName} minimumPayment={pay} />
        <EditDebtDialog debt={d} />
        <DeleteDebtButton debtId={d.id} creditorName={d.creditorName} />
      </div>
    </div>
  );
}

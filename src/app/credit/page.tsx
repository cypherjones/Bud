import Link from "next/link";
import { PlanPage, SectionHead, TotalsStrip, Total, Aside } from "@/components/plan/plan-ui";
import { LogCreditScoreDialog } from "@/components/credit/log-credit-score-dialog";
import { CreditTriageTable } from "@/components/credit/credit-triage-table";
import { SettlementBudgetCard } from "@/components/credit/settlement-budget-card";
import { CreditTimeline } from "@/components/credit/credit-timeline";
import { getCreditPicture, type ScorePoint, type Tradeline } from "@/lib/credit/picture";
import { logSeenDebtPayments } from "@/lib/debts/seen-payments";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const monthYear = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
const short = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function CreditPage() {
  logSeenDebtPayments();
  const p = getCreditPicture();
  const { triage } = p;
  const reportMonth = monthYear(p.reportDate);
  const usePct = p.cards.limit > 0 ? Math.round((p.cards.balance / p.cards.limit) * 100) : null;

  return (
    <PlanPage
      title="Credit"
      sub={
        <>
          The {reportMonth} Experian report, checked against what Bud has seen since. The report only changes when you log
          a new one; balances and payments here are live.
        </>
      }
      actions={<LogCreditScoreDialog />}
    >
      <TotalsStrip cols={5}>
        <Total
          label="Score"
          value={p.latest ? String(p.latest.score) : "—"}
          note={p.latest ? `${p.tier} · ${p.latest.bureau ? p.latest.bureau[0].toUpperCase() + p.latest.bureau.slice(1) + " " : ""}${short(p.latest.date)}${(p.monthsOld ?? 0) >= 2 ? `, ${p.monthsOld} months old` : ""}` : "None logged"}
          tone={p.latest && p.latest.score < 580 ? "text-red-400" : undefined}
        />
        <Total
          label="Card use"
          value={usePct === null ? "—" : `${usePct}%`}
          note={`${formatCurrencyCompact(p.cards.balance)} of ${formatCurrencyCompact(p.cards.limit)} on your cards${p.cards.reportedPct !== null ? `. Was ${p.cards.reportedPct}% on the report` : ""}`}
          tone={usePct !== null && usePct < 10 ? "text-emerald-400" : usePct !== null && usePct > 30 ? "text-red-400" : undefined}
        />
        <Total label="Loans, today" value={formatCurrencyCompact(p.loansNow)} note={p.loanNames.join(", ")} href="/debts" />
        <Total
          label="Old debts"
          value={formatCurrencyCompact(p.derogatory.owed)}
          note={`${p.derogatory.count} charge-offs and collections, duplicates counted once`}
        />
        <Total
          label="First to fall off"
          value={p.derogatory.firstFallOff ? monthYear(p.derogatory.firstFallOff.date) : "—"}
          note={p.derogatory.firstFallOff?.creditor}
        />
      </TotalsStrip>

      <section className="space-y-3">
        <SectionHead title="What to do next" sub="Most urgent first. Keeping current loans current comes before anything on the old debts." />
        <ol className="divide-y divide-border rounded-xl border border-border bg-card">
          {p.actions.map((a, i) => (
            <li key={i} className="flex gap-3 px-4 py-3">
              <span
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                  a.tone === "bad" ? "bg-red-500/15 text-red-400" : a.tone === "warn" ? "bg-amber-500/15 text-amber-400" : "bg-accent text-muted-foreground",
                )}
              >
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="font-medium leading-snug">{a.title}</p>
                  {a.cost !== undefined && (
                    <p className="text-xs font-mono tabular-nums text-muted-foreground">{a.cost === 0 ? "free" : formatCurrency(a.cost)}</p>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground leading-relaxed">{a.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3">
        <SectionHead
          title={`Since the ${reportMonth.split(" ")[0]} report`}
          sub="Your open accounts: what the report said, and where they are now."
        />
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {p.tradelines.map((t) => (
            <TradelineRow key={t.item.id} t={t} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Loan balances marked est. move by each payment Bud sees in the bank, less the interest the APR adds between payments.
          Update a balance from the lender&apos;s site on <Link href="/debts" className="underline decoration-dotted underline-offset-2">Debts</Link> and the estimate starts from there.
        </p>
      </section>

      <section className="space-y-3">
        <SectionHead title="Score history" sub="Every score you've logged. The trend needs at least two." />
        <ScoreHistory scores={p.scores} />
      </section>

      <section className="space-y-3">
        <SectionHead
          title="Old debts"
          sub="Charge-offs and collections from the report. Settle with deletion in writing, or wait out the ones close to falling off."
        />
        <SettlementBudgetCard summary={triage.summary} />
        <CreditTimeline items={[...triage.chargeOffs, ...triage.collections]} />
      </section>

      <section className="space-y-3">
        <SectionHead title={`Everything on the ${reportMonth.split(" ")[0]} report`} sub="Mark each item as you work through it: negotiating, settled, removed." />
        <CreditTriageTable
          active={triage.active}
          authorizedUser={triage.authorizedUser}
          chargeOffs={triage.chargeOffs}
          collections={triage.collections}
        />
        <Aside>
          These are the report&apos;s balances as of {reportMonth}. Open accounts move on Debts; this list changes when you edit an item
          or pull a new report.
        </Aside>
      </section>
    </PlanPage>
  );
}

function TradelineRow({ t }: { t: Tradeline }) {
  const changed = t.now !== null && t.now !== t.reported;
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3">
      <div className="flex-1 min-w-[220px]">
        <p className="font-medium leading-snug">
          {t.item.creditor}
          {t.item.accountLast4 && <span className="ml-2 text-xs font-mono text-muted-foreground">{t.item.accountLast4}</span>}
        </p>
        <p
          className={cn(
            "mt-0.5 text-sm leading-snug",
            t.tone === "bad" ? "text-red-400" : t.tone === "warn" ? "text-amber-400" : t.tone === "good" ? "text-emerald-400" : "text-muted-foreground",
          )}
        >
          {t.headline}
        </p>
      </div>
      <div className="text-right text-sm">
        <p className="font-mono tabular-nums">
          {t.now === null ? formatCurrency(t.reported) : formatCurrency(t.now)}
          {t.estimated && t.now !== 0 && <span className="ml-1 text-[11px] text-muted-foreground">est.</span>}
        </p>
        {changed && <p className="text-xs text-muted-foreground font-mono tabular-nums">report {formatCurrency(t.reported)}</p>}
      </div>
    </div>
  );
}

function ScoreHistory({ scores }: { scores: ScorePoint[] }) {
  if (scores.length === 0) return <p className="text-sm text-muted-foreground">No score logged yet. Use Log score above.</p>;
  const pts = [...scores].reverse();
  const W = 600;
  const H = 120;
  const min = Math.min(...pts.map((s) => s.score), 500) - 10;
  const max = Math.max(...pts.map((s) => s.score), 600) + 10;
  const x = (i: number) => (pts.length === 1 ? W / 2 : 16 + (i * (W - 32)) / (pts.length - 1));
  const y = (s: number) => H - 12 - ((s - min) / (max - min)) * (H - 24);
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-3">
      {pts.length > 1 && (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28" role="img" aria-label="Score over time">
          <line x1={0} x2={W} y1={y(580)} y2={y(580)} className="stroke-border" strokeDasharray="4 4" />
          <text x={W - 4} y={y(580) - 4} textAnchor="end" className="fill-muted-foreground text-[10px]">580 fair</text>
          <polyline fill="none" className="stroke-primary" strokeWidth={2} points={pts.map((s, i) => `${x(i)},${y(s.score)}`).join(" ")} />
          {pts.map((s, i) => (
            <circle key={i} cx={x(i)} cy={y(s.score)} r={3.5} className="fill-primary" />
          ))}
        </svg>
      )}
      <table className="w-full text-sm">
        <tbody>
          {scores.map((s, i) => {
            const prev = scores[i + 1];
            const diff = prev ? s.score - prev.score : null;
            return (
              <tr key={s.date + i} className="border-b border-border last:border-b-0">
                <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">{short(s.date)}</td>
                <td className="py-1.5 pr-3">{[s.bureau, s.source].filter(Boolean).join(" · ")}</td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {s.score}
                  {diff !== null && diff !== 0 && (
                    <span className={cn("ml-2 text-xs", diff > 0 ? "text-emerald-400" : "text-red-400")}>
                      {diff > 0 ? "+" : "−"}
                      {Math.abs(diff)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

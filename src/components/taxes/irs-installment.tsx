import { SectionHead, Aside } from "@/components/plan/plan-ui";
import { LogTaxPaymentDialog } from "@/components/taxes/log-tax-payment-dialog";
import type { TaxPicture, IrsMonth } from "@/lib/actions/taxes";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

const usd = (dollars: number) => formatCurrencyCompact(Math.round(dollars * 100) + 0);
const day = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const longDay = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const monthName = (ym: string) =>
  new Date(ym + "-01T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
const syncedOn = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "never";
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

const IRS_ACCOUNT = "https://www.irs.gov/payments/your-online-account";

export function IrsInstallment({ irs, obligations }: { irs: TaxPicture["irs"]; obligations: TaxPicture["obligations"] }) {
  const missing = irs.months.filter((m) => m.status === "missing");
  const paidMonths = irs.months.filter((m) => m.status === "paid");
  const seenTotal = irs.payments.reduce((s, p) => s + p.amount, 0);

  return (
    <section className="space-y-3">
      <SectionHead
        title="Owed to the IRS"
        sub="His installment agreement from before the marriage. Payments are read from the bank, so this updates when one posts."
      />

      {missing.length > 0 && (
        <Aside tone="warn" title={`No ${list(missing.map((m) => monthName(m.month).split(" ")[0]))} payment appears in any synced account`}>
          <p>
            The installment has come out around the {irs.usualDay}
            {ordinal(irs.usualDay ?? 0)} of each month
            {paidMonths.length > 0 && <>, most recently {list(paidMonths.slice(-3).flatMap((m) => m.dates.map(day)))}</>}.
            {irs.payingAccount && (
              <>
                {" "}
                The last one came from {irs.payingAccount.name}, which synced on {syncedOn(irs.payingAccount.lastSynced)} and shows no IRS
                debit since.
              </>
            )}
            {irs.quietAccounts.length > 0 && (
              <>
                {" "}
                {list(irs.quietAccounts.map((a) => `${a.name} (no activity since ${day(a.lastActivity)})`))}{" "}
                could hide a payment, so check {irs.quietAccounts.length === 1 ? "it" : "them"} too.
              </>
            )}
          </p>
          <p>
            <b className="text-foreground">A missed installment can put the agreement in default.</b> Check the{" "}
            <a href={IRS_ACCOUNT} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
              IRS online account
            </a>{" "}
            or call the number on the agreement letter. If {missing.length === 1 ? "it" : "they"} didn&apos;t go, pay{" "}
            {irs.monthly ? usd(irs.monthly * missing.length) : "the missed amount"} now rather than waiting for the next one.
          </p>
        </Aside>
      )}

      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-3">
          <div className="flex-1 min-w-[200px]">
            <p className="font-medium">{irs.tracked ? "Balance" : "Balance, estimated"}</p>
            <p className="mt-0.5 text-sm text-muted-foreground leading-relaxed">
              {irs.tracked ? (
                <>From the obligation tracked below, less the payments logged against it.</>
              ) : (
                <>
                  The household plan&apos;s {usd(irs.baseline)} as of {longDay(irs.baselineAsOf)}
                  {irs.paidSinceBaseline > 0 ? `, less ${usd(irs.paidSinceBaseline)} paid since` : ", with no payment seen since"}. Interest and the
                  failure-to-pay penalty keep adding to it; the IRS online account has the exact figure.
                </>
              )}
            </p>
          </div>
          <p className="text-xl font-semibold font-mono tabular-nums">{usd(irs.balance)}</p>
        </div>
        {irs.monthly !== null && (
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-3">
            <div className="flex-1 min-w-[200px]">
              <p className="font-medium">Monthly payment</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                From the household plan line.
                {irs.monthly > 0 && irs.balance > 0 && <> At this rate the balance takes about {Math.ceil(irs.balance / irs.monthly)} more payments, before interest.</>}
              </p>
            </div>
            <p className="font-mono tabular-nums">{usd(irs.monthly)}</p>
          </div>
        )}
      </div>

      {irs.months.length > 0 ? (
        <ol className="rounded-xl border border-border bg-card divide-y divide-border">
          {irs.months.map((m) => (
            <MonthRow key={m.month} m={m} monthly={irs.monthly} from={irs.payments.filter((p) => p.date.startsWith(m.month))} />
          ))}
        </ol>
      ) : (
        <Aside tone="warn">No payment to the IRS appears in any synced account.</Aside>
      )}
      <p className="text-xs text-muted-foreground leading-relaxed">
        {irs.payments.length > 0 && (
          <>
            {usd(seenTotal)} paid across {irs.payments.length} {irs.payments.length === 1 ? "payment" : "payments"} since{" "}
            {longDay(irs.payments[0].date)}.{" "}
          </>
        )}
        Bud counts a payment when a debit naming the IRS posts in a synced account; one made from an account Bud doesn&apos;t sync won&apos;t
        show here.
      </p>

      {obligations.length > 0 && (
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {obligations.map((o) => (
            <div key={o.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
              <div className="flex-1 min-w-[200px]">
                <p className="font-medium">
                  {o.agency} {o.taxYear}
                  <span className="ml-2 text-xs text-muted-foreground">{o.status}</span>
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {formatCurrency(o.remainingBalance)} left of {formatCurrency(o.originalAmount)}
                  {o.installmentAmount ? ` · ${formatCurrency(o.installmentAmount)} a month` : ""}
                  {o.dueDate ? ` · due ${longDay(o.dueDate)}` : ""}
                  {o.payments[0] ? ` · last logged ${longDay(o.payments[0].date)}` : ""}
                </p>
              </div>
              <LogTaxPaymentDialog
                obligationId={o.id}
                agency={o.agency}
                taxYear={o.taxYear}
                remainingBalance={o.remainingBalance}
                installmentAmount={o.installmentAmount}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MonthRow({ m, monthly, from }: { m: IrsMonth; monthly: number | null; from: { date: string; amount: number; account: string }[] }) {
  const detail =
    m.status === "paid"
      ? from.map((p) => `${usd(p.amount)} on ${day(p.date)} from ${p.account}`).join("; ")
      : m.status === "missing"
        ? `Not seen. It was due about ${day(m.expected)}.`
        : m.status === "due"
          ? `Due about ${day(m.expected)}.`
          : `Next, about ${day(m.expected)}.`;
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-2.5">
      <div className="flex-1 min-w-[200px]">
        <p className="font-medium">{monthName(m.month)}</p>
        <p className={cn("text-sm", m.status === "missing" ? "text-red-400" : "text-muted-foreground")}>{detail}</p>
      </div>
      <p
        className={cn(
          "font-mono tabular-nums text-sm",
          m.status === "paid" ? "text-emerald-400" : m.status === "missing" ? "text-red-400" : "text-muted-foreground",
        )}
      >
        {m.status === "paid" ? usd(m.paid) : m.status === "missing" ? "none" : monthly ? usd(monthly) : "—"}
      </p>
    </li>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

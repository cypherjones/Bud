import { SectionHead } from "@/components/plan/plan-ui";
import type { IrsMonth } from "@/lib/actions/taxes";
import { formatCurrencyCompact } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

const usd = (dollars: number) => formatCurrencyCompact(Math.round(dollars * 100) + 0);
const day = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const monthOf = (ym: string) => new Date(ym + "-01T00:00:00").toLocaleDateString("en-US", { month: "long" });
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

type Item = { date: string; title: string; detail: React.ReactNode; tone?: "bad" | "warn" | "good" };

export type ChecklistProps = {
  today: string;
  irsMonths: IrsMonth[];
  irsMonthly: number | null;
  upcomingPaydays: string[];
  total: number;
  withheld: number;
  dueAtFiling: number;
  hasOtherPayroll: boolean;
};

/** What has a date on it between now and the 2026 return, soonest first. */
export function YearEndChecklist(p: ChecklistProps) {
  const year = Number(p.today.slice(0, 4));
  const next = year + 1;
  const items: Item[] = [];

  for (const m of p.irsMonths) {
    if (m.status === "missing")
      items.push({
        date: m.expected,
        title: `${monthOf(m.month)}'s IRS installment${p.irsMonthly ? `, ${usd(p.irsMonthly)}` : ""}`,
        detail: "Not seen in any synced account. Confirm it in the IRS online account and pay it if it didn't go.",
        tone: "bad",
      });
    else if (m.status === "due" || m.status === "upcoming")
      items.push({
        date: m.expected,
        title: `${monthOf(m.month)}'s IRS installment${p.irsMonthly ? `, ${usd(p.irsMonthly)}` : ""}`,
        detail: "This page marks it paid when the debit posts.",
      });
  }

  if (p.upcomingPaydays.length > 0)
    items.push({
      date: p.upcomingPaydays[0],
      title: "Settle the W-4 before the next paycheck",
      detail: `${p.upcomingPaydays.length} ${p.upcomingPaydays.length === 1 ? "check is" : "checks are"} left this year: ${list(p.upcomingPaydays.map(day))}. A change only reaches the ones payroll runs after it's in.`,
    });

  items.push({
    date: `${year}-12-31`,
    title: "Last day for anything that counts on the 2026 return",
    detail:
      "Giving paid by transfer, check or card by 31 December counts toward the $2,000 deduction; cash with no record never does. Harvard Extension tuition paid by then counts for the 2026 Lifetime Learning Credit.",
  });

  items.push(
    p.dueAtFiling > 1000
      ? {
          date: `${next}-01-15`,
          title: `Fourth-quarter estimated tax, about ${usd(p.dueAtFiling)}`,
          detail:
            "The return is on track to owe, mostly the self-employment tax on the guaranteed payments. Pay it with Form 1040-ES, or raise withholding on the checks that are left: withholding counts as paid evenly through the year, an estimate doesn't.",
          tone: "warn",
        }
      : {
          date: `${next}-01-15`,
          title: "Fourth-quarter estimated tax: not needed on these numbers",
          detail: `Withholding (${usd(p.withheld)} for the year) covers the ${usd(p.total)} estimate, self-employment tax included. Check again if the guaranteed payments or April's profit go up.`,
          tone: "good",
        },
  );

  items.push({
    date: `${next}-01-31`,
    title: "W-2s and the 1098-T arrive",
    detail: p.hasOtherPayroll
      ? "Navusoft's W-2, a W-2 from whoever ran the A.S. Infinite Solutions payroll through Gusto, and Harvard Extension's 1098-T."
      : "Navusoft's W-2 and Harvard Extension's 1098-T.",
  });

  items.push({
    date: `${next}-04-15`,
    title: "File 2026: federal joint, and his Georgia part-year return",
    detail:
      "Form 8379 goes with the federal return if April wants her share of the refund kept from his balance. Georgia Form 500 covers 1 January to 31 August. Filing and paying on time is a condition of the installment agreement.",
  });

  items.sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section className="space-y-3">
      <SectionHead title="Before the year ends" sub="Everything with a date on it between now and the 2026 return, soonest first." />
      <ChecklistList items={items} today={p.today} />

      <h3 className="pt-2 text-sm font-semibold">Closing Meridian</h3>
      <ChecklistList
        today={p.today}
        items={[
          {
            date: `${next}-01-15`,
            title: "Find out whether Meridian terminated on 27 October or is winding up",
            detail:
              "Confirm with your CPA. If it terminated with the final draw, its tax year ended that day and the final Form 1065 is due 15 January (the 15th day of the third month after the year ends). If it is still winding up, the return is due 15 March as usual.",
            tone: "warn",
          },
          {
            date: `${next}-01-15`,
            title: "Final Form 1065, with K-1s marked final",
            detail:
              "His K-1 states the guaranteed payments and his share of the loss; the personal return can't be finished without it. A late 1065 is penalised per partner per month. Due 15 January if terminated, 15 March if not.",
          },
          {
            date: `${next}-01-15`,
            title: "Georgia partnership return, if it applies",
            detail:
              "Meridian is a Georgia LLC, so it likely owes a final Georgia Form 700 on the same schedule as the 1065. Confirm with your CPA.",
          },
          {
            date: `${next}-01-15`,
            title: "Any change to the operating agreement for 2026",
            detail:
              "Partners can amend the agreement for a year up to the partnership return's original due date (26 U.S.C. §761(c)), so the UPE question has the same deadline as the 1065. Ask whether it is still worth doing for a closed partnership.",
          },
        ]}
      />
    </section>
  );
}

function ChecklistList({ items, today }: { items: Item[]; today: string }) {
  return (
    <ol className="divide-y divide-border rounded-xl border border-border bg-card">
      {items.map((it, i) => {
        const past = it.date < today;
        return (
          <li key={i} className="flex gap-3 px-4 py-3">
            <span
              className={cn(
                "mt-0.5 w-14 shrink-0 text-xs font-mono tabular-nums",
                it.tone === "bad" ? "text-red-400" : past ? "text-muted-foreground line-through" : "text-muted-foreground",
              )}
            >
              {day(it.date)}
              {it.date.slice(0, 4) !== today.slice(0, 4) && <span className="block">{it.date.slice(0, 4)}</span>}
            </span>
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  "font-medium leading-snug",
                  it.tone === "bad" && "text-red-400",
                  it.tone === "warn" && "text-amber-400",
                  it.tone === "good" && "text-emerald-400",
                )}
              >
                {it.title}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground leading-relaxed">{it.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

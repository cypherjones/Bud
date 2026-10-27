import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The plan's visual language — a titled page with a reading-width column,
 * sections headed by a rule and a one-line explanation, ledger tables, and a
 * strip of totals. Server-safe: no hooks.
 */

export function PlanPage({
  title,
  sub,
  eyebrow,
  actions,
  children,
  wide,
}: {
  title: string;
  sub?: React.ReactNode;
  eyebrow?: { href: string; label: string };
  actions?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex flex-col h-full">
      <header className="px-4 sm:px-8 pt-6 pb-5 border-b border-border bg-card/50">
        <div className={cn("mx-auto flex flex-wrap items-end gap-x-6 gap-y-3", wide ? "max-w-6xl" : "max-w-5xl")}>
          <div className="flex-1 min-w-[240px]">
            {eyebrow && (
              <Link
                href={eyebrow.href}
                className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                {eyebrow.label}
              </Link>
            )}
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {sub && <p className="mt-1 text-sm text-muted-foreground max-w-prose">{sub}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </header>
      <div className="flex-1 overflow-auto px-4 py-6 sm:px-8 sm:py-8">
        <div className={cn("mx-auto space-y-10", wide ? "max-w-6xl" : "max-w-5xl")}>{children}</div>
      </div>
    </div>
  );
}

export function SectionHead({ title, sub, id }: { title: string; sub?: React.ReactNode; id?: string }) {
  return (
    <div id={id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border pb-2 scroll-mt-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {sub && <p className="text-sm text-muted-foreground flex-1 min-w-[240px]">{sub}</p>}
    </div>
  );
}

export function TotalsStrip({ children, cols = 5 }: { children: React.ReactNode; cols?: 2 | 3 | 4 | 5 | 6 }) {
  const lg = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4", 5: "md:grid-cols-5", 6: "md:grid-cols-3 xl:grid-cols-6" }[cols];
  return (
    <div className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border", lg)}>
      {children}
    </div>
  );
}

export function Total({
  label,
  value,
  note,
  tone,
  href,
}: {
  label: string;
  value: string;
  note?: React.ReactNode;
  tone?: string;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-xl font-semibold font-mono tabular-nums", tone)}>{value}</p>
      {note && <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">{note}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="bg-card px-4 py-3 min-w-0 hover:bg-accent/40 transition-colors">
      {body}
    </Link>
  ) : (
    <div className="bg-card px-4 py-3 min-w-0">{body}</div>
  );
}

export function LedgerRow({
  label,
  value,
  total,
  dim,
  tone,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  total?: boolean;
  dim?: boolean;
  tone?: string;
}) {
  return (
    <tr className={cn(total && "border-t border-border font-semibold", dim && "text-muted-foreground")}>
      <td className={cn("py-1 pr-3", total && "pt-2")}>{label}</td>
      <td className={cn("py-1 text-right font-mono tabular-nums whitespace-nowrap", total && "pt-2", tone)}>{value}</td>
    </tr>
  );
}

/** A short block of explanation under a section, in the plan's voice. */
export function Aside({ title, children, tone }: { title?: string; children: React.ReactNode; tone?: "warn" | "good" }) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-sm leading-relaxed",
        tone === "warn" ? "border-amber-500/30 bg-amber-500/5" : tone === "good" ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-card",
      )}
    >
      {title && <p className="font-semibold mb-1">{title}</p>}
      <div className="text-muted-foreground space-y-2">{children}</div>
    </div>
  );
}

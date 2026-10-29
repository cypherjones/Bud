import Link from "next/link";
import { db, schema } from "@/lib/db";
import { PlanPage, SectionHead, TotalsStrip, Total } from "@/components/plan/plan-ui";
import { SyncNow, AddSimplefinToken } from "@/components/settings/bank-sync-controls";
import { getBalances, type AccountBalance } from "@/lib/actions/balances";
import { bankSyncAllowed, SYNC_REFUSED_MESSAGE } from "./sync-guard";

export const dynamic = "force-dynamic";

const TZ = "America/Chicago";
const link = "underline decoration-dotted underline-offset-2";

/** A sync timestamp (UTC ISO) in Central time: "Oct 29, 1:05 PM CDT". */
const when = (ts: string) =>
  new Date(ts).toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
/** Just the Central-time clock: "1:05 PM CDT". */
const clock = (ts: string) => new Date(ts).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", timeZoneName: "short" });
/** The Central-time calendar day of a timestamp: "Jun 2, 2026". */
const onDay = (ts: string) => new Date(ts).toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric" });

export default function SettingsPage() {
  const allowed = bankSyncAllowed();
  const connections = db
    .select({
      id: schema.simplefinConnections.id,
      name: schema.simplefinConnections.name,
      lastSynced: schema.simplefinConnections.lastSynced,
      createdAt: schema.simplefinConnections.createdAt,
    })
    .from(schema.simplefinConnections)
    .all();

  const accounts = getBalances();
  const syncing = accounts.filter((a) => a.syncing);
  const stopped = accounts.filter((a) => !a.syncing).sort((a, b) => (a.lastSynced ?? "").localeCompare(b.lastSynced ?? ""));
  const lastSync =
    [...connections.map((c) => c.lastSynced), ...accounts.map((a) => a.lastSynced)].filter((s): s is string => !!s).sort().at(-1) ?? null;

  return (
    <PlanPage title="Settings">
      <section className="space-y-4">
        <SectionHead
          title="Bank sync"
          sub="The production server pulls from the banks through SimpleFIN. This shows how fresh that is. Times are Central."
        />

        <TotalsStrip cols={3}>
          <Total label="Last sync" value={lastSync ? clock(lastSync) : "never"} note={lastSync ? onDay(lastSync) : "No sync has run yet"} />
          <Total
            label="Accounts syncing"
            value={String(syncing.length)}
            note={`${syncing.filter((a) => a.counted).length} counted in totals, ${syncing.filter((a) => !a.counted).length} excluded`}
            href="/balances"
          />
          <Total
            label="Stopped feeds"
            value={String(stopped.length)}
            note={stopped.length === 0 ? "Every feed is current" : stopped.map((a) => a.name).join(", ")}
            tone={stopped.length > 0 ? "text-amber-400" : "text-emerald-400"}
          />
        </TotalsStrip>

        <SyncNow allowed={allowed} hasConnection={connections.length > 0} refusedMessage={SYNC_REFUSED_MESSAGE} />
      </section>

      <section className="space-y-3">
        <SectionHead title="Connections" sub="Each SimpleFIN account Bud reads. Banks are added and removed inside SimpleFIN Bridge." />
        {connections.length === 0 ? (
          <p className="text-sm text-muted-foreground">No SimpleFIN connection yet. Add a token below.</p>
        ) : (
          <div className="rounded-xl border border-border bg-card px-4 py-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-1 pr-3 text-left font-semibold">Connection</th>
                  <th className="py-1 pl-3 text-right font-semibold">Last synced</th>
                </tr>
              </thead>
              <tbody>
                {connections.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-b-0">
                    <td className="py-1.5 pr-3">
                      {c.name}
                      <span className="block text-[11px] text-muted-foreground">Connected {onDay(c.createdAt)}</span>
                    </td>
                    <td className="py-1.5 pl-3 text-right whitespace-nowrap text-[13px] text-muted-foreground">
                      {c.lastSynced ? when(c.lastSynced) : "never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {stopped.length > 0 && (
        <section className="space-y-3">
          <SectionHead
            title="Stopped feeds"
            sub={
              <>
                These accounts stopped updating while the rest kept syncing. Bud keeps their history and leaves them out of every total.
                Reconnect or remove them in SimpleFIN Bridge. Live numbers are on <Link href="/balances" className={link}>Balances</Link>.
              </>
            }
          />
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {stopped.map((a) => (
              <StoppedRow key={a.id} a={a} live={syncing} />
            ))}
          </div>
        </section>
      )}

      <AddSimplefinToken allowed={allowed} hasConnection={connections.length > 0} />
    </PlanPage>
  );
}

function StoppedRow({ a, live }: { a: AccountBalance; live: AccountBalance[] }) {
  const twin = live.some((l) => l.name === a.name && l.kind === a.kind);
  return (
    <div className="px-4 py-3 text-sm">
      <p className="font-medium leading-snug">{a.name}</p>
      <p className="mt-0.5 text-muted-foreground leading-snug">
        {a.lastSynced ? `Last update ${onDay(a.lastSynced)}.` : "Never updated."}{" "}
        {twin
          ? `A second ${a.name} feed is still syncing, so this one is a leftover duplicate.`
          : a.counted
            ? "Its last balance is history, not today's number."
            : "It was already excluded from totals."}
      </p>
    </div>
  );
}

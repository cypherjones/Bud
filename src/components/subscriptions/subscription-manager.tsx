"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client/api";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { SectionHead, Aside } from "@/components/plan/plan-ui";
import {
  APPLE_MANAGE_URL,
  DONE,
  RUNNING,
  STATUS_LABEL,
  TO_DO,
  monthlyCents,
  yourMonthlyCents,
  type Entry,
  type Status,
  type SubRow,
  type SubscriptionsView,
} from "@/lib/subscriptions/model";

const day = (d: string | null | undefined) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
const byCost = (a: SubRow, b: SubRow) => monthlyCents(b.entry) - monthlyCents(a.entry);
const manageUrl = (e: Entry) => e.manageUrl || (e.provider === "apple" ? APPLE_MANAGE_URL : undefined);

type Patch = Partial<Omit<Entry, "id" | "provider" | "pausedScheduleIds">>;

function useSubs() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const call = async (key: string, method: string, body: unknown) => {
    setBusy(key);
    setError(null);
    try {
      const res = await apiFetch("/api/subscriptions", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
      return true;
    } catch {
      setError("Couldn't save. Check the connection and try again.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  return {
    busy,
    error,
    patch: (id: string, patch: Patch) => call(id, "PATCH", { id, patch }),
    dismiss: (id: string) => call(id, "POST", { dismiss: id }),
    remove: (id: string) => call(id, "DELETE", { id }),
    create: (entry: Entry) => call("new", "POST", { create: [entry] }),
  };
}

type Subs = ReturnType<typeof useSubs>;

export function SubscriptionManager({ view }: { view: SubscriptionsView }) {
  const subs = useSubs();
  const all = [...view.apple, ...view.direct];
  const leaking = all.filter((r) => r.stillCharging);
  const toDo = all.filter((r) => TO_DO.includes(r.entry.status) && !r.looksStopped).sort(byCost);
  const appleKeep = view.apple.filter((r) => r.entry.status === "keep").sort(byCost);
  const unclaimed = view.appleUnclaimed.filter((r) => !r.looksStopped);
  const unclaimedOld = view.appleUnclaimed.filter((r) => r.looksStopped);
  const directKeep = view.direct.filter((r) => r.entry.status === "keep" && !r.looksStopped).sort(byCost);
  const directStopped = view.direct.filter((r) => RUNNING.includes(r.entry.status) && r.looksStopped).sort(byCost);
  const done = all.filter((r) => DONE.includes(r.entry.status)).sort(byCost);

  return (
    <>
      {subs.error && <Aside tone="warn">{subs.error}</Aside>}

      {leaking.length > 0 && (
        <Aside tone="warn" title="Still charging after you stopped it">
          {leaking.map((r) => (
            <p key={r.entry.id}>
              <span className="text-foreground font-medium">{r.entry.name}</span> was marked{" "}
              {STATUS_LABEL[r.entry.status].toLowerCase()} on {day(r.entry.statusDate)}, then charged{" "}
              {formatCurrency(r.stillCharging!.amount)} on {day(r.stillCharging!.date)}. Check that it really ended
              {r.entry.provider === "apple" ? " in Apple's subscription list" : ""}, and ask for a refund.
            </p>
          ))}
        </Aside>
      )}

      <section className="space-y-3">
        <SectionHead
          title="To do"
          sub={toDo.length === 0 ? "Nothing waiting. Mark anything below as Cancel or Hand off and it shows up here." : "Cancel these, or get them moved to whoever should pay. Tick Done once it's finished."}
        />
        {toDo.length > 0 && (
          <List>
            {toDo.map((r) => (
              <Item key={r.entry.id} row={r} subs={subs} today={view.today} todo />
            ))}
          </List>
        )}
      </section>

      <section className="space-y-3">
        <SectionHead
          title="Apple"
          sub="Apple bills every subscription as one word, “Apple”, so Bud tells them apart by price and renewal day."
        />
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <a href={APPLE_MANAGE_URL} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline" className="h-8 text-xs">
              Open Apple subscriptions <ExternalLink />
            </Button>
          </a>
          <span>On the iPhone: Settings → your name → Subscriptions.</span>
        </div>
        <List>
          {appleKeep.map((r) => (
            <Item key={r.entry.id} row={r} subs={subs} today={view.today} />
          ))}
          {appleKeep.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">No Apple subscriptions kept.</p>}
        </List>

        {unclaimed.length > 0 && (
          <div className="space-y-2 pt-2">
            <h3 className="text-sm font-semibold">Billing through Apple, not on the list</h3>
            <p className="text-sm text-muted-foreground">
              These amounts come from Apple every month and don&apos;t match anything above. Most likely a Family Sharing
              member&apos;s subscription, or one that isn&apos;t on this Apple ID. Find it in Apple&apos;s list and name it, or
              dismiss it if it isn&apos;t a subscription.
            </p>
            <List>
              {unclaimed.map((r) => (
                <Unclaimed key={r.entry.id} row={r} subs={subs} />
              ))}
            </List>
          </div>
        )}

        {(unclaimedOld.length > 0 || view.appleOneOffs.length > 0) && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Older and one-off Apple charges
            </summary>
            <div className="mt-2 space-y-2 text-muted-foreground">
              {unclaimedOld.length > 0 && (
                <p>
                  Stopped billing:{" "}
                  {unclaimedOld.map((r) => `${formatCurrency(r.entry.amount)} (last ${day(r.lastCharged)})`).join(", ")}.
                </p>
              )}
              {view.appleOneOffs.length > 0 && (
                <p>
                  One-off charges in the last 90 days:{" "}
                  {view.appleOneOffs.map((c) => `${formatCurrency(c.amount)} on ${day(c.date)}`).join(", ")}.
                </p>
              )}
            </div>
          </details>
        )}
      </section>

      <section className="space-y-3">
        <SectionHead title="Everything else" sub="Billed directly to a card or account. Found from the bank's subscription charges." />
        <List>
          {directKeep.map((r) => (
            <Item key={r.entry.id} row={r} subs={subs} today={view.today} />
          ))}
        </List>
        {directStopped.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Looks stopped · {directStopped.length} with no charge in over six weeks
            </summary>
            <p className="mt-2 mb-2 text-muted-foreground">
              Mark these cancelled if you ended them, so Bud warns you if one starts charging again.
            </p>
            <List>
              {directStopped.map((r) => (
                <Item key={r.entry.id} row={r} subs={subs} today={view.today} />
              ))}
            </List>
          </details>
        )}
      </section>

      {done.length > 0 && (
        <section className="space-y-3">
          <SectionHead title="Cancelled and handed off" sub="Bud checks each one against the bank after its billing date." />
          <List>
            {done.map((r) => (
              <Item key={r.entry.id} row={r} subs={subs} today={view.today} />
            ))}
          </List>
        </section>
      )}

      <AddForm subs={subs} />
    </>
  );
}

function List({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-border rounded-xl border border-border bg-card">{children}</div>;
}

function Verification({ row }: { row: SubRow }) {
  if (!DONE.includes(row.entry.status)) return null;
  if (row.stillCharging) return <span className="text-red-400">Charged again {day(row.stillCharging.date)}</span>;
  if (row.confirmedStopped) return <span className="text-emerald-400">Confirmed: no charge since</span>;
  if (row.accountQuiet) return <span>Can&apos;t confirm, the account&apos;s feed is quiet</span>;
  return <span>Waiting for the {day(row.nextExpected)} billing date to confirm</span>;
}

function Item({ row, subs, today, todo }: { row: SubRow; subs: Subs; today: string; todo?: boolean }) {
  const { entry: e } = row;
  const [editing, setEditing] = useState(false);
  const busy = subs.busy === e.id;
  const done = DONE.includes(e.status);
  const yours = yourMonthlyCents(e);
  const url = manageUrl(e);

  const meta: React.ReactNode[] = [];
  if (e.forWhom) meta.push(e.forWhom);
  if (e.status === "transfer" && e.transferTo) meta.push(<span className="text-amber-400">Hand off to {e.transferTo}</span>);
  if (e.status === "transferred" && e.transferTo) meta.push(`Now ${e.transferTo}'s`);
  if (e.sharedWith) meta.push(`${e.sharedWith} pays ${e.theirSharePct ?? 0}%`);
  if (!done && row.nextExpected) meta.push(`${row.nextExpected <= today ? "Due" : "Renews"} ${day(row.nextExpected)}`);
  if (row.lastCharged) meta.push(`last charged ${day(row.lastCharged)}`);
  else meta.push("no charge seen yet");
  if (row.accountQuiet && !done) meta.push(<span className="text-amber-400">{row.accountQuiet}&apos;s feed is quiet</span>);

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="flex-1 min-w-[200px]">
          <p className="font-medium leading-snug">
            {e.name}
            {e.detail && <span className="ml-2 text-xs font-normal text-muted-foreground">{e.detail}</span>}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
            {meta.map((m, i) => (
              <span key={i}>
                {i > 0 && " · "}
                {m}
              </span>
            ))}
          </p>
          {done && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {STATUS_LABEL[e.status]} {day(e.statusDate)} · <Verification row={row} />
            </p>
          )}
          {e.note && <p className="mt-1 text-xs text-muted-foreground italic">{e.note}</p>}
        </div>
        <div className="text-right">
          <p className={cn("font-mono tabular-nums", done && "text-muted-foreground line-through")}>
            {formatCurrency(e.amount)}
            <span className="text-xs text-muted-foreground">{e.cadence === "yearly" ? "/yr" : "/mo"}</span>
          </p>
          {yours !== monthlyCents(e) && <p className="text-xs text-muted-foreground font-mono">{formatCurrency(yours)} yours</p>}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {todo ? (
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={busy}
            onClick={() => subs.patch(e.id, { status: e.status === "transfer" ? "transferred" : "cancelled" })}
          >
            Done, {e.status === "transfer" ? "handed off" : "cancelled"}
          </Button>
        ) : done ? (
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => subs.patch(e.id, { status: "keep" })}>
            Undo
          </Button>
        ) : null}
        {!done && (
          <StatusPicker
            value={e.status}
            disabled={busy}
            onChange={(status) => {
              subs.patch(e.id, { status });
              if (status === "transfer" && !e.transferTo) setEditing(true);
            }}
          />
        )}
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            Manage <ExternalLink className="size-3" />
          </a>
        )}
        <button
          onClick={() => setEditing(!editing)}
          className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          aria-expanded={editing}
        >
          <Pencil className="size-3" /> {editing ? "Close" : "Edit"}
        </button>
      </div>

      {editing && <EditForm row={row} subs={subs} onDone={() => setEditing(false)} />}
    </div>
  );
}

function StatusPicker({ value, disabled, onChange }: { value: Status; disabled?: boolean; onChange: (s: Status) => void }) {
  const options: Status[] = ["keep", "cancel", "transfer"];
  return (
    <div role="radiogroup" aria-label="What to do with it" className="inline-flex rounded-lg border border-border p-0.5">
      {options.map((s) => (
        <button
          key={s}
          role="radio"
          aria-checked={value === s}
          disabled={disabled}
          onClick={() => value !== s && onChange(s)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs transition-colors",
            value === s
              ? s === "keep"
                ? "bg-accent text-foreground"
                : "bg-amber-500/15 text-amber-300"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={cn("block text-xs text-muted-foreground space-y-1", wide && "sm:col-span-2")}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function EditForm({ row, subs, onDone }: { row: SubRow; subs: Subs; onDone: () => void }) {
  const e = row.entry;
  const [f, setF] = useState({
    name: e.name,
    detail: e.detail ?? "",
    amount: (e.amount / 100).toFixed(2),
    cadence: e.cadence,
    renewsOn: e.renewsOn ?? "",
    forWhom: e.forWhom ?? "",
    transferTo: e.transferTo ?? "",
    sharedWith: e.sharedWith ?? "",
    theirSharePct: e.theirSharePct ? String(e.theirSharePct) : "",
    manageUrl: e.manageUrl ?? "",
    note: e.note ?? "",
  });
  const set = (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: ev.target.value });

  const save = async () => {
    const amount = Math.round(parseFloat(f.amount) * 100);
    const ok = await subs.patch(e.id, {
      name: f.name.trim() || e.name,
      detail: f.detail,
      amount: Number.isFinite(amount) && amount >= 0 ? amount : e.amount,
      cadence: f.cadence,
      renewsOn: f.renewsOn as Entry["renewsOn"],
      forWhom: f.forWhom,
      transferTo: f.transferTo,
      sharedWith: f.sharedWith,
      theirSharePct: f.sharedWith && f.theirSharePct ? Math.min(100, Math.max(0, Number(f.theirSharePct))) : 0,
      manageUrl: f.manageUrl.trim(),
      note: f.note,
    });
    if (ok) onDone();
  };

  return (
    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-border bg-background/40 p-3">
      <Field label="Name"><Input value={f.name} onChange={set("name")} /></Field>
      <Field label="What it is"><Input value={f.detail} onChange={set("detail")} placeholder="iCloud+ with 2 TB" /></Field>
      <Field label="Price">
        <div className="flex gap-2">
          <Input inputMode="decimal" value={f.amount} onChange={set("amount")} className="font-mono" />
          <select value={f.cadence} onChange={set("cadence")} className="rounded-md border border-input bg-transparent px-2 text-sm">
            <option value="monthly">a month</option>
            <option value="yearly">a year</option>
          </select>
        </div>
      </Field>
      <Field label="Next renewal"><Input type="date" value={f.renewsOn} onChange={set("renewsOn")} /></Field>
      <Field label="Who it's for"><Input value={f.forWhom} onChange={set("forWhom")} placeholder="Simon's iPhone" /></Field>
      <Field label="Hand off to"><Input value={f.transferTo} onChange={set("transferTo")} placeholder="Seth" /></Field>
      <Field label="Shared with">
        <div className="flex gap-2">
          <Input value={f.sharedWith} onChange={set("sharedWith")} placeholder="Mom" />
          <Input inputMode="numeric" value={f.theirSharePct} onChange={set("theirSharePct")} placeholder="%" className="w-20 font-mono" />
        </div>
      </Field>
      <Field label="Manage link"><Input value={f.manageUrl} onChange={set("manageUrl")} placeholder="https://" /></Field>
      <Field label="Note" wide><Input value={f.note} onChange={set("note")} /></Field>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
        <Button size="sm" className="h-8 text-xs" disabled={subs.busy === e.id} onClick={save}>Save</Button>
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onDone}>Cancel</Button>
        {row.saved && (
          <button
            className="ml-auto text-xs text-muted-foreground hover:text-red-400"
            onClick={() => {
              if (confirm(`Forget ${e.name}? It comes back as a suggestion if it keeps charging.`)) subs.remove(e.id).then(onDone);
            }}
          >
            Forget it
          </button>
        )}
      </div>
    </div>
  );
}

function Unclaimed({ row, subs }: { row: SubRow; subs: Subs }) {
  const [name, setName] = useState("");
  const busy = subs.busy === row.entry.id;
  const days = [...new Set(row.charges.map((c) => new Date(c.date + "T00:00:00").getDate()))].sort((a, b) => a - b);
  return (
    <div className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-[140px]">
        <p className="font-mono tabular-nums">{formatCurrency(row.entry.amount)}</p>
        <p className="text-xs text-muted-foreground">
          {row.charges.length} charges, around the {days.map(ordinal).join(" / ")} · last {day(row.lastCharged)}
        </p>
      </div>
      <form
        className="flex flex-1 min-w-[220px] items-center gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (name.trim()) subs.patch(row.entry.id, { name: name.trim() });
        }}
      >
        <Input value={name} onChange={(ev) => setName(ev.target.value)} placeholder="What is it?" className="h-8" />
        <Button type="submit" size="sm" variant="outline" className="h-8 text-xs" disabled={busy || !name.trim()}>Name it</Button>
      </form>
      <button className="text-xs text-muted-foreground hover:text-foreground" disabled={busy} onClick={() => subs.dismiss(row.entry.id)}>
        Not a subscription
      </button>
    </div>
  );
}

function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
}

function AddForm({ subs }: { subs: Subs }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ provider: "direct" as Entry["provider"], name: "", amount: "", cadence: "monthly" as Entry["cadence"], renewsOn: "" });
  const cents = Math.round(parseFloat(f.amount) * 100);
  const valid = f.name.trim() && Number.isFinite(cents) && cents > 0;

  const add = async () => {
    if (!valid) return;
    const ok = await subs.create({
      id: f.provider === "apple" ? `apple:${cents}` : `m:${f.name.trim().toUpperCase()}`,
      provider: f.provider,
      name: f.name.trim(),
      amount: cents,
      cadence: f.cadence,
      status: "keep",
      ...(f.renewsOn ? { renewsOn: f.renewsOn } : {}),
    });
    if (ok) {
      setF({ ...f, name: "", amount: "", renewsOn: "" });
      setOpen(false);
    }
  };

  if (!open)
    return (
      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setOpen(true)}>
        <Plus /> Add a subscription
      </Button>
    );

  return (
    <section className="space-y-3">
      <SectionHead title="Add a subscription" sub="For one the bank hasn't billed yet, or one Bud didn't pick up." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4">
        <Field label="Billed by">
          <select
            value={f.provider}
            onChange={(ev) => setF({ ...f, provider: ev.target.value as Entry["provider"] })}
            className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="direct">The company directly</option>
            <option value="apple">Apple</option>
          </select>
        </Field>
        <Field label="Name"><Input value={f.name} onChange={(ev) => setF({ ...f, name: ev.target.value })} /></Field>
        <Field label="Price">
          <div className="flex gap-2">
            <Input inputMode="decimal" value={f.amount} onChange={(ev) => setF({ ...f, amount: ev.target.value })} className="font-mono" placeholder="9.99" />
            <select
              value={f.cadence}
              onChange={(ev) => setF({ ...f, cadence: ev.target.value as Entry["cadence"] })}
              className="rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="monthly">a month</option>
              <option value="yearly">a year</option>
            </select>
          </div>
        </Field>
        <Field label="Next renewal"><Input type="date" value={f.renewsOn} onChange={(ev) => setF({ ...f, renewsOn: ev.target.value })} /></Field>
        <div className="sm:col-span-2 flex gap-2">
          <Button size="sm" className="h-8 text-xs" disabled={!valid || subs.busy === "new"} onClick={add}>Add</Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </div>
    </section>
  );
}

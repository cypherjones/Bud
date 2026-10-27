"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrencyCompact } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { Plus, X } from "lucide-react";
import { sideMonth, APP_MODELS, APP_STATUSES } from "@/lib/business/calc";
import type { AppPlan, SidePlan } from "@/lib/business/config";
import { NumberField, usePlanSaver, SaveIndicator } from "./plan-inputs";
import { LedgerRow, SectionHead, TotalsStrip, Total } from "./plan-ui";

const usd = (dollars: number) => formatCurrencyCompact(Math.round(dollars * 100));

const STATUS_TONE: Record<AppPlan["status"], string> = {
  idea: "bg-muted text-muted-foreground",
  building: "bg-amber-500/15 text-amber-500",
  beta: "bg-blue-500/15 text-blue-400",
  live: "bg-emerald-500/15 text-emerald-400",
};

export function SidePlanner({ initial }: { initial: SidePlan }) {
  const [p, setP] = useState(initial);
  const { state, send, schedule } = usePlanSaver();
  const m = sideMonth(p);

  const set = (patch: Partial<SidePlan>) => {
    const next = { ...p, ...patch };
    setP(next);
    schedule("side", () => send("/api/business/config", "PATCH", { side: next }));
  };
  const setApp = (id: string, patch: Partial<AppPlan>) => set({ apps: p.apps.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  const removeApp = (id: string) => {
    if (confirm("Remove this app from the plan?")) set({ apps: p.apps.filter((a) => a.id !== id) });
  };
  const addApp = (name: string) =>
    set({
      apps: [
        ...p.apps,
        { id: `app_${Date.now().toString(36)}`, name, status: "idea", model: "paid", price: 0, unitsPerMonth: 0, costMonthly: 0, note: "" },
      ],
    });

  return (
    <div className="space-y-10">
      <TotalsStrip cols={4}>
        <Total label="Apps, net" value={usd(m.appsNet - m.developer)} note={`After Apple's ${p.appleCommissionPct}% and the $${p.developerProgram} a year`} />
        <Total label="Consulting" value={usd(m.consultingNet)} note={`${p.consulting.hoursPerMonth} hours at ${usd(p.consulting.rate)}`} />
        <Total label="Yours to spend" value={usd(m.takeHome)} tone={m.takeHome >= 0 ? undefined : "text-red-400"}
          note={`After ${p.setAsidePct}% set aside for tax`} />
        <Total label={`Against the ${usd(p.goal)} goal`} value={m.gap > 0 ? `−${usd(m.gap)}` : "met"}
          tone={m.gap > 0 ? "text-red-400" : "text-emerald-400"}
          note={m.gap > 0 && m.extraHours > 0 ? `${Math.ceil(m.extraHours)} more consulting hours a month closes it` : "a month"} />
      </TotalsStrip>

      <section className="space-y-3">
        <SectionHead id="apps" title="The apps" sub="Each app's price, sales and running cost. Nothing is priced yet, so they start at zero." />
        <div className="space-y-3">
          {m.apps.map(({ app, gross, commission, net }) => (
            <Card key={app.id}>
              <CardContent className="space-y-3 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Input value={app.name} onChange={(e) => setApp(app.id, { name: e.target.value })} aria-label="App name"
                    className="h-8 w-44 font-semibold" />
                  <select value={app.status} onChange={(e) => setApp(app.id, { status: e.target.value as AppPlan["status"] })} aria-label="Status"
                    className={cn("h-7 rounded-full border-0 px-2.5 text-[11px] font-semibold capitalize", STATUS_TONE[app.status])}>
                    {APP_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select value={app.model} onChange={(e) => setApp(app.id, { model: e.target.value as AppPlan["model"] })} aria-label="Pricing model"
                    className="h-7 rounded-md border border-border bg-background px-2 text-xs">
                    {APP_MODELS.map((s) => <option key={s} value={s}>{s === "paid" ? "Paid up front" : s === "subscription" ? "Subscription" : "Free"}</option>)}
                  </select>
                  <span className="ml-auto font-mono tabular-nums text-sm font-semibold">{usd(net)}<span className="text-muted-foreground font-normal">/mo</span></span>
                  <button type="button" onClick={() => removeApp(app.id)} aria-label={`Remove ${app.name}`} className="text-muted-foreground hover:text-red-400">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <NumberField id={`price_${app.id}`} label={app.model === "subscription" ? "Price per month" : "Price"} step={0.99}
                    value={app.price} onChange={(n) => setApp(app.id, { price: n })} />
                  <NumberField id={`units_${app.id}`} unit="#" label={app.model === "subscription" ? "Paying subscribers" : "Sales a month"}
                    value={app.unitsPerMonth} onChange={(n) => setApp(app.id, { unitsPerMonth: n })} />
                  <NumberField id={`cost_${app.id}`} label="Running cost a month" step={5}
                    value={app.costMonthly} onChange={(n) => setApp(app.id, { costMonthly: n })} hint="API, hosting, the Worker." />
                </div>
                <Input value={app.note} onChange={(e) => setApp(app.id, { note: e.target.value })} placeholder="What it is, what's left to ship"
                  aria-label="Notes" className="h-8 text-xs text-muted-foreground" />
                {gross > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {usd(gross)} in sales, {usd(commission)} to Apple, {usd(app.costMonthly)} to run it.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
          <AddApp onAdd={addApp} />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHead id="consulting" title="Consulting" sub="Hours sold a month at a rate. The rate is a starting guess until there's an offer behind it." />
        <Card>
          <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
            <NumberField id="rate" label="Hourly rate" step={5} value={p.consulting.rate}
              onChange={(n) => set({ consulting: { ...p.consulting, rate: n } })} />
            <NumberField id="hours" label="Hours a month" unit="#" value={p.consulting.hoursPerMonth}
              onChange={(n) => set({ consulting: { ...p.consulting, hoursPerMonth: n } })} hint="Around a full-time job." />
            <NumberField id="ccosts" label="Costs a month" step={5} value={p.consulting.costs}
              onChange={(n) => set({ consulting: { ...p.consulting, costs: n } })} hint="Tools, insurance." />
            <NumberField id="goal" label="Goal, to spend per month" step={50} value={p.goal}
              onChange={(n) => set({ goal: n })} hint="From the May plan: $500 a month of side income." />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHead id="tax" title="Tax and Apple's cut" sub="Side income is self-employment income: Schedule C, plus self-employment tax, with nothing withheld." />
        <Card>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-1">
            <table className="w-full text-sm self-start">
              <tbody>
                <LedgerRow label="Apps, after Apple and running costs" value={usd(m.appsNet)} />
                <LedgerRow dim label="Developer Program, by the month" value={`−${usd(m.developer)}`} />
                <LedgerRow label="Consulting, after costs" value={usd(m.consultingNet)} />
                <LedgerRow total label="Profit a month" value={usd(m.profit)} />
                <LedgerRow dim label={`Set aside for tax, ${p.setAsidePct}%`} value={`−${usd(m.setAside)}`} />
                <LedgerRow total label="Yours to spend" value={usd(m.takeHome)} />
              </tbody>
            </table>
            <div className="grid grid-cols-2 gap-4 self-start">
              <NumberField id="sideSetAside" label="Set aside for tax" unit="%" value={p.setAsidePct} onChange={(n) => set({ setAsidePct: n })} />
              <NumberField id="commission" label="Apple's commission" unit="%" value={p.appleCommissionPct} onChange={(n) => set({ appleCommissionPct: n })}
                hint="15% in the Small Business Program, 30% without it." />
              <NumberField id="devProgram" label="Developer Program, a year" value={p.developerProgram} onChange={(n) => set({ developerProgram: n })} />
            </div>
          </CardContent>
        </Card>
        <SaveIndicator state={state} />
      </section>
    </div>
  );
}

function AddApp({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  const submit = () => {
    if (!name.trim()) return;
    onAdd(name.trim());
    setName("");
  };
  return (
    <div className="flex items-center gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Another app" aria-label="New app name"
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }} className="h-8 w-56 text-sm" />
      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={submit} disabled={!name.trim()}>
        <Plus className="w-3 h-3 mr-1" /> Add an app
      </Button>
    </div>
  );
}

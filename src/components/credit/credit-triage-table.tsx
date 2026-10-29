"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  AlertTriangle,
  Scale,
  Trash2,
  GripHorizontal,
  Pencil,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils/format";
import { apiFetch } from "@/lib/client/api";
import type { CreditTriageItem } from "@/lib/actions/credit-triage";

type Status = CreditTriageItem["status"];

const STATUS_META: Record<Status, { label: string; tone: string }> = {
  pay: { label: "PAY", tone: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  negotiate: { label: "NEGOTIATE", tone: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  settle: { label: "SETTLE", tone: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  dispute: { label: "DISPUTE", tone: "bg-red-500/15 text-red-400 border-red-500/30" },
  settled: { label: "SETTLED", tone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  removed: { label: "REMOVED", tone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  ignore: { label: "—", tone: "bg-muted text-muted-foreground border-border" },
};

const STATUS_OPTIONS: Array<{ value: Status; label: string }> = [
  { value: "pay", label: "PAY (active)" },
  { value: "negotiate", label: "NEGOTIATE (charge-off)" },
  { value: "settle", label: "SETTLE (collection)" },
  { value: "dispute", label: "DISPUTE (duplicate/error)" },
  { value: "settled", label: "SETTLED (resolved)" },
  { value: "removed", label: "REMOVED (deleted from report)" },
  { value: "ignore", label: "IGNORE (no action)" },
];

function CategoryGroup({
  title,
  subtitle,
  items,
  onChange,
  icon,
}: {
  title: string;
  subtitle: string;
  items: CreditTriageItem[];
  onChange: () => void;
  icon: React.ReactNode;
}) {
  if (items.length === 0) return null;
  const totalBalance = items.reduce((s, i) => s + i.balanceCents, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {icon}
              {title}
              <span className="text-xs font-normal text-muted-foreground">
                · {items.length} item{items.length !== 1 ? "s" : ""} · {formatCurrency(totalBalance)}
              </span>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {items.map((item) => (
          <TriageRow key={item.id} item={item} onChange={onChange} />
        ))}
      </CardContent>
    </Card>
  );
}

function TriageRow({ item, onChange }: { item: CreditTriageItem; onChange: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [offerInput, setOfferInput] = useState<string>(
    item.settlementOfferCents !== null ? (item.settlementOfferCents / 100).toString() : "",
  );
  const [settledInput, setSettledInput] = useState<string>(
    item.settledAmountCents !== null ? (item.settledAmountCents / 100).toString() : "",
  );

  const statusMeta = STATUS_META[item.status];
  const isResolved = item.status === "settled" || item.status === "removed";

  async function patchItem(body: Record<string, unknown>) {
    const res = await apiFetch(`/api/credit/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      toast.error(data.error ?? "Failed to update");
      return false;
    }
    onChange();
    return true;
  }

  async function handleStatusChange(value: Status) {
    setSavingStatus(true);
    const ok = await patchItem({ status: value });
    if (ok) toast.success(`${item.creditor} → ${STATUS_META[value].label}`);
    setSavingStatus(false);
  }

  async function handleSaveOffer() {
    const dollars = offerInput === "" ? null : parseFloat(offerInput);
    if (dollars !== null && (!Number.isFinite(dollars) || dollars < 0)) {
      toast.error("Offer must be zero or positive");
      return;
    }
    const ok = await patchItem({ settlementOfferDollars: dollars });
    if (ok) toast.success("Offer saved");
  }

  async function handleSaveSettled() {
    const dollars = settledInput === "" ? null : parseFloat(settledInput);
    if (dollars !== null && (!Number.isFinite(dollars) || dollars < 0)) {
      toast.error("Settled amount must be zero or positive");
      return;
    }
    const ok = await patchItem({ settledAmountDollars: dollars });
    if (ok) toast.success("Settled amount saved");
  }

  return (
    <div
      className={`rounded-md border ${
        isResolved
          ? "border-emerald-500/30 bg-emerald-500/5"
          : item.status === "dispute"
            ? "border-red-500/30 bg-red-500/5"
            : "border-input bg-background"
      } p-3`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-medium text-sm ${isResolved ? "line-through text-muted-foreground" : ""}`}>
              {item.creditor}
            </span>
            {item.accountLast4 && (
              <span className="text-[10px] text-muted-foreground font-mono">·{item.accountLast4}</span>
            )}
            <Badge variant="outline" className={`${statusMeta.tone} text-[10px]`}>
              {statusMeta.label}
            </Badge>
            {item.duplicateOfId && (
              <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30 text-[10px]">
                duplicate
              </Badge>
            )}
          </div>
          {item.originalCreditor && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              orig: {item.originalCreditor}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className={`font-semibold text-sm ${isResolved ? "line-through text-muted-foreground" : ""}`}>
            {formatCurrency(item.balanceCents)}
          </p>
          {item.fallOffDate && (
            <p className="text-[10px] text-muted-foreground">
              falls off {item.fallOffDate.slice(0, 7)}
            </p>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
        <select
          value={item.status}
          onChange={(e) => handleStatusChange(e.target.value as Status)}
          disabled={savingStatus}
          className="text-xs rounded-md border border-input bg-background px-2 py-1"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <GripHorizontal className="w-3 h-3" />
          {expanded ? "collapse" : "details / offer"}
        </button>
        <EditCreditItemDialog item={item} onChanged={onChange} />
        <DeleteCreditItemButton id={item.id} creditor={item.creditor} onChanged={onChange} />
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-border space-y-2.5">
          {item.notes && (
            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{item.notes}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase">
                Settlement offer
              </label>
              <div className="flex gap-1">
                <span className="self-center text-xs text-muted-foreground">$</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={offerInput}
                  onChange={(e) => setOfferInput(e.target.value)}
                  placeholder="0"
                  className="h-7 text-xs"
                />
                <Button size="sm" variant="outline" className="h-7 px-2" onClick={handleSaveOffer}>
                  save
                </Button>
              </div>
              {item.balanceCents > 0 && offerInput && parseFloat(offerInput) > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {Math.round((parseFloat(offerInput) * 100 * 100) / item.balanceCents)}% of balance
                </p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase">
                Settled (paid)
              </label>
              <div className="flex gap-1">
                <span className="self-center text-xs text-muted-foreground">$</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={settledInput}
                  onChange={(e) => setSettledInput(e.target.value)}
                  placeholder="0"
                  className="h-7 text-xs"
                />
                <Button size="sm" variant="outline" className="h-7 px-2" onClick={handleSaveSettled}>
                  save
                </Button>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
            {item.firstDelinquencyDate && <span>1st delinq: {item.firstDelinquencyDate}</span>}
            {item.lastReportedDate && <span>last reported: {item.lastReportedDate}</span>}
            {item.solDate && <span>SoL: {item.solDate.slice(0, 7)}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function DeleteCreditItemButton({
  id,
  creditor,
  onChanged,
}: {
  id: string;
  creditor: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleDelete() {
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/credit/items/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Failed to delete");
        return;
      }
      toast.success(`${creditor} removed`);
      setOpen(false);
      onChanged();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] text-muted-foreground hover:text-red-500 inline-flex items-center gap-1"
      >
        <Trash2 className="w-3 h-3" />
        delete
      </button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {creditor}?</DialogTitle>
          <DialogDescription>
            Removes this credit-report item from your tracker. The actual report entry isn&apos;t
            affected — this just stops showing it here.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
          <Button variant="destructive" onClick={handleDelete} disabled={submitting}>
            {submitting ? "Removing…" : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditCreditItemDialog({
  item,
  onChanged,
}: {
  item: CreditTriageItem;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [creditor, setCreditor] = useState(item.creditor);
  const [originalCreditor, setOriginalCreditor] = useState(item.originalCreditor ?? "");
  const [accountLast4, setAccountLast4] = useState(item.accountLast4 ?? "");
  const [balanceDollars, setBalanceDollars] = useState((item.balanceCents / 100).toString());
  const [firstDelinquencyDate, setFirstDelinquencyDate] = useState(item.firstDelinquencyDate ?? "");
  const moveRelevant = item.moveRelevant;
  const [notes, setNotes] = useState(item.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSave() {
    const balance = parseFloat(balanceDollars);
    if (!Number.isFinite(balance) || balance < 0) {
      toast.error("Balance must be zero or positive");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/credit/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creditor: creditor.trim(),
          originalCreditor: originalCreditor.trim() || null,
          accountLast4: accountLast4.trim() || null,
          balanceDollars: balance,
          firstDelinquencyDate: firstDelinquencyDate || null,
          moveRelevant,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Failed to save");
        return;
      }
      toast.success("Saved");
      setOpen(false);
      onChanged();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        <Pencil className="w-3 h-3" />
        edit
      </button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit credit item</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <label className="text-xs text-muted-foreground">Creditor</label>
            <Input value={creditor} onChange={(e) => setCreditor(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Original creditor (for collections)</label>
            <Input value={originalCreditor} onChange={(e) => setOriginalCreditor(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Account last 4</label>
              <Input value={accountLast4} onChange={(e) => setAccountLast4(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Balance ($)</label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={balanceDollars}
                onChange={(e) => setBalanceDollars(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">First delinquency (YYYY-MM)</label>
            <Input
              placeholder="2024-09"
              value={firstDelinquencyDate}
              onChange={(e) => setFirstDelinquencyDate(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Drives SoL (TX 4-yr) and 7-year fall-off date.
            </p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Props = {
  active: CreditTriageItem[];
  authorizedUser: CreditTriageItem[];
  chargeOffs: CreditTriageItem[];
  collections: CreditTriageItem[];
};

export function CreditTriageTable({ active, authorizedUser, chargeOffs, collections }: Props) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <div className="space-y-4">
      <CategoryGroup
        title="Active obligations"
        subtitle="Currently open accounts. Bring past-due current; never let one charge off."
        items={active}
        onChange={refresh}
        icon={<AlertTriangle className="w-4 h-4 text-blue-500" />}
      />
      <CategoryGroup
        title="Charge-offs"
        subtitle="Already closed/written off by original lender. Negotiate pay-for-delete; aim 30-50%."
        items={chargeOffs}
        onChange={refresh}
        icon={<Scale className="w-4 h-4 text-amber-500" />}
      />
      <CategoryGroup
        title="Collections"
        subtitle="Sold to debt buyers. Most aggressive negotiation — settle 25-40% with delete language."
        items={collections}
        onChange={refresh}
        icon={<Scale className="w-4 h-4 text-purple-500" />}
      />
      <CategoryGroup
        title="Authorized user (positive tradelines)"
        subtitle="Aged accounts on someone else's report. Helps your average-age and utilization. Do not remove."
        items={authorizedUser}
        onChange={refresh}
        icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
      />
    </div>
  );
}

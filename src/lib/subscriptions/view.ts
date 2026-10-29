import { db, schema } from "@/lib/db";
import { and, eq, gte } from "drizzle-orm";
import { cleanMerchantDisplay, normalizeMerchantKey } from "@/lib/utils/merchant";
import { median } from "@/lib/utils/cadence";
import { getExcludedAccountIds } from "@/lib/actions/dashboard";
import { getRegistry } from "./registry";
import { brandKey } from "./brand";
import { DONE, KNOWN_MANAGE_URLS, iso, nextRenewal, type Entry, type SubRow, type SubscriptionsView } from "./model";

type Charge = { date: string; amount: number; key: string; display: string; group: string | null; tags: string; accountId: string | null };


const WINDOW_DAYS = 180;
const APPLE = "APPLE";
/** Apple bills a renewal within a few days of the date it shows. */
const APPLE_LAG_DAYS = 12;
/** A monthly charge this long gone has very likely stopped. */
const STOPPED_DAYS = 45;

const day = (s: string) => new Date(s + "T00:00:00");
const daysBetween = (a: string, b: string) => Math.round((day(b).getTime() - day(a).getTime()) / 86400000);
const addMonths = (s: string, n: number) => {
  const d = day(s);
  const anchor = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(anchor, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return iso(d);
};

function loadCharges(today: string): Charge[] {
  const since = iso(new Date(day(today).getTime() - WINDOW_DAYS * 86400000));
  const excluded = new Set(getExcludedAccountIds());
  const rows = db
    .select({
      date: schema.transactions.date,
      amount: schema.transactions.amount,
      merchant: schema.transactions.merchant,
      description: schema.transactions.description,
      accountId: schema.transactions.accountId,
      group: schema.categoryGroups.name,
      tags: schema.transactions.id,
    })
    .from(schema.transactions)
    .leftJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
    .leftJoin(schema.categoryGroups, eq(schema.categories.groupId, schema.categoryGroups.id))
    .where(and(eq(schema.transactions.type, "expense"), gte(schema.transactions.date, since)))
    .all();

  // Tag names per transaction, for proposals that predate this page (#cancel, #kill-list).
  const tagRows = db
    .select({ tx: schema.transactionTags.transactionId, name: schema.tags.name })
    .from(schema.transactionTags)
    .innerJoin(schema.tags, eq(schema.transactionTags.tagId, schema.tags.id))
    .all();
  const tagsByTx = new Map<string, string[]>();
  for (const t of tagRows) tagsByTx.set(t.tx, [...(tagsByTx.get(t.tx) ?? []), t.name]);

  return rows
    .filter((r) => !r.accountId || !excluded.has(r.accountId))
    .map((r) => {
      const raw = r.merchant || r.description || "";
      return {
        date: r.date,
        amount: r.amount,
        key: brandKey(normalizeMerchantKey(raw) || normalizeMerchantKey(r.description ?? "") || cleanMerchantDisplay(raw).toUpperCase()),
        display: cleanMerchantDisplay(raw) || raw,
        group: r.group,
        tags: (tagsByTx.get(r.tags) ?? []).join(","),
        accountId: r.accountId,
      };
    });
}

/**
 * Give each Apple entry one charge per billing cycle: the one with its
 * price that lands soonest after the renewal day. Two subscriptions at the
 * same price on different days each get their own; whatever's left over is
 * unclaimed.
 */
function claimApple(entries: Entry[], pool: Charge[]): Map<string, Charge[]> {
  const claimed = new Map<string, Charge[]>();
  const taken = new Set<Charge>();
  const ordered = [...entries].sort((a, b) => Number(!!b.renewsOn) - Number(!!a.renewsOn));
  for (const e of ordered) {
    const prices = new Set([e.amount, ...(e.priceHistory ?? [])]);
    const anchor = e.renewsOn ? day(e.renewsOn).getDate() : null;
    const best = new Map<string, { c: Charge; lag: number }>();
    for (const c of pool) {
      if (taken.has(c) || !prices.has(c.amount)) continue;
      let cycle: string;
      let lag = 0;
      if (anchor === null) {
        cycle = c.date.slice(0, 7);
      } else {
        // The renewal on or before this charge.
        const d = day(c.date);
        const r = new Date(d.getFullYear(), d.getMonth(), Math.min(anchor, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
        if (r > d) r.setMonth(r.getMonth() - 1, Math.min(anchor, new Date(r.getFullYear(), r.getMonth(), 0).getDate()));
        cycle = iso(r);
        lag = daysBetween(cycle, c.date);
        if (lag > APPLE_LAG_DAYS) continue;
      }
      const cur = best.get(cycle);
      if (!cur || lag < cur.lag) best.set(cycle, { c, lag });
    }
    const mine = [...best.values()].map((b) => b.c);
    mine.forEach((c) => taken.add(c));
    claimed.set(e.id, mine.sort((a, b) => b.date.localeCompare(a.date)));
  }
  return claimed;
}

type Accounts = Map<string, { name: string; lastActivity: string | null }>;

function loadAccounts(): Accounts {
  const accts = db.select({ id: schema.accounts.id, name: schema.accounts.name, institution: schema.accounts.institution }).from(schema.accounts).all();
  const last = db
    .select({ accountId: schema.transactions.accountId, date: schema.transactions.date })
    .from(schema.transactions)
    .all();
  const newest = new Map<string, string>();
  for (const t of last) if (t.accountId && (!newest.has(t.accountId) || t.date > newest.get(t.accountId)!)) newest.set(t.accountId, t.date);
  return new Map(accts.map((a) => [a.id, { name: `${a.institution.replace(/\s*\(.*\)\s*$/, "")} ${a.name}`.trim(), lastActivity: newest.get(a.id) ?? null }]));
}

function row(entry: Entry, saved: boolean, charges: Charge[], today: string, accounts?: Accounts): SubRow {
  const list = charges.map((c) => ({ date: c.date, amount: c.amount })).sort((a, b) => b.date.localeCompare(a.date));
  const lastCharged = list[0]?.date ?? null;
  const renewal = nextRenewal(entry.renewsOn, entry.cadence, today);
  const nextExpected = renewal ?? (lastCharged ? addMonths(lastCharged, entry.cadence === "yearly" ? 12 : 1) : null);
  const done = DONE.includes(entry.status);
  const after = done && entry.statusDate ? list.find((c) => daysBetween(entry.statusDate!, c.date) > 2) ?? null : null;
  // Done, and a full cycle has gone by since the last charge with nothing new.
  const cycleDays = entry.cadence === "yearly" ? 372 : 38;
  const confirmedStopped = done && !after && !!lastCharged && daysBetween(lastCharged, today) > cycleDays;
  // If the account it bills to has gone quiet since the charge was due, silence means nothing.
  const lastAcct = [...charges].sort((a, b) => b.date.localeCompare(a.date))[0]?.accountId;
  const acct = lastAcct ? accounts?.get(lastAcct) : undefined;
  const due = lastCharged ? addMonths(lastCharged, entry.cadence === "yearly" ? 12 : 1) : null;
  const accountQuiet = acct && due && due < today && (!acct.lastActivity || acct.lastActivity < due) ? acct.name : null;
  const looksStopped = !saved && !accountQuiet && entry.cadence === "monthly" && !!lastCharged && daysBetween(lastCharged, today) > STOPPED_DAYS;
  return {
    entry, saved, charges: list, lastCharged, nextExpected, looksStopped, stillCharging: after,
    confirmedStopped: confirmedStopped && !accountQuiet, accountQuiet,
  };
}

/** Monthly unless the charges are about a year apart. */
function cadenceOf(charges: Charge[]): Entry["cadence"] {
  const dates = charges.map((c) => c.date).sort();
  const gaps = dates.slice(1).map((d, i) => daysBetween(dates[i], d));
  return gaps.length && median(gaps) >= 300 ? "yearly" : "monthly";
}

export function getSubscriptionsView(now: Date = new Date()): SubscriptionsView {
  const today = iso(now);
  const reg = getRegistry();
  const charges = loadCharges(today);
  const accounts = loadAccounts();
  const dismissed = new Set(reg.dismissed);

  // ---- Apple -------------------------------------------------------------
  const applePool = charges.filter((c) => c.key === APPLE);
  const appleSaved = reg.entries.filter((e) => e.provider === "apple");
  const claims = claimApple(appleSaved, applePool);
  const apple = appleSaved.map((e) => row(e, true, claims.get(e.id) ?? [], today, accounts));
  const claimedSet = new Set([...claims.values()].flat());
  const left = applePool.filter((c) => !claimedSet.has(c));

  // Left-over amounts that repeat monthly and are still going are someone's subscription.
  const byAmount = new Map<number, Charge[]>();
  for (const c of left) byAmount.set(c.amount, [...(byAmount.get(c.amount) ?? []), c]);
  const appleUnclaimed: SubRow[] = [];
  const oneOffs: Charge[] = [];
  for (const [amount, cs] of byAmount) {
    const id = `apple:${amount}`;
    const months = new Set(cs.map((c) => c.date.slice(0, 7)));
    const newest = cs.map((c) => c.date).sort().at(-1)!;
    if (months.size >= 2 && daysBetween(newest, today) <= 60 && !dismissed.has(id)) {
      const entry: Entry = { id, provider: "apple", name: `Apple ${(amount / 100).toFixed(2)}`, amount, cadence: "monthly", status: "keep" };
      appleUnclaimed.push(row(entry, false, cs, today, accounts));
    } else {
      oneOffs.push(...cs);
    }
  }
  appleUnclaimed.sort((a, b) => b.entry.amount - a.entry.amount);

  // ---- Everything else ---------------------------------------------------
  const directSaved = new Map(reg.entries.filter((e) => e.provider === "direct").map((e) => [e.id, e]));
  const groups = new Map<string, Charge[]>();
  for (const c of charges) {
    if (c.key === APPLE || !c.key) continue;
    const id = `m:${c.key}`;
    if (c.group !== "Subscriptions & Software" && !directSaved.has(id)) continue;
    if (/^(TRANSFER|WITHDRAWAL|DEPOSIT|APPLE CASH|APPLECARD|INTERNATIONAL|FOREIGN)/.test(c.key)) continue;
    groups.set(id, [...(groups.get(id) ?? []), c]);
  }
  // A brand with two plans still billing at clearly different prices (Claude at $200 and the
  // API at $20) is two subscriptions: split it by price, "m:BRAND@cents".
  for (const [id, cs] of [...groups]) {
    if (directSaved.has(id)) continue;
    const byPrice = new Map<number, Charge[]>();
    for (const c of cs) byPrice.set(c.amount, [...(byPrice.get(c.amount) ?? []), c]);
    const live = [...byPrice.entries()].filter(([, p]) => new Set(p.map((c) => c.date.slice(0, 7))).size >= 2 && p.some((c) => daysBetween(c.date, today) <= 60));
    if (live.length < 2) continue;
    const prices = live.map(([a]) => a).sort((a, b) => a - b);
    if (prices.at(-1)! < prices[0] * 1.5) continue;
    groups.delete(id);
    for (const [amount, p] of live) groups.set(`${id}@${amount}`, p);
  }
  const direct: SubRow[] = [];
  for (const [id, cs] of groups) {
    const saved = directSaved.get(id);
    if (saved) {
      direct.push(row(saved, true, cs, today, accounts));
      continue;
    }
    if (dismissed.has(id)) continue;
    const recent = [...cs].sort((a, b) => b.date.localeCompare(a.date));
    const key = id.slice(2).replace(/@\d+$/, "");
    const tags = recent[0].tags;
    // Proposals carry over what Reports already knew: #cancel is done, #kill-list is to do.
    const status: Entry["status"] = /(^|,)cancel(,|$)/.test(tags) ? "cancelled" : /kill-list/.test(tags) ? "cancel" : "keep";
    const entry: Entry = {
      id,
      provider: "direct",
      name: recent[0].display,
      amount: Math.round(median(recent.slice(0, 3).map((c) => c.amount))),
      cadence: cadenceOf(cs),
      status,
      ...(status === "cancelled" ? { statusDate: recent[0].date } : {}),
      ...(KNOWN_MANAGE_URLS[key] ? { manageUrl: KNOWN_MANAGE_URLS[key] } : {}),
    };
    direct.push(row(entry, false, cs, today, accounts));
  }
  // Saved entries with no charges in the window still belong on the page.
  for (const [id, e] of directSaved) if (!groups.has(id)) direct.push(row(e, true, [], today, accounts));
  direct.sort((a, b) => b.entry.amount - a.entry.amount);

  // ---- The budget's subscription lines ----------------------------------
  const budgetLines = db
    .select({ label: schema.householdLines.label, amount: schema.householdLines.amount, group: schema.categoryGroups.name })
    .from(schema.householdLines)
    .leftJoin(schema.categories, eq(schema.householdLines.categoryId, schema.categories.id))
    .leftJoin(schema.categoryGroups, eq(schema.categories.groupId, schema.categoryGroups.id))
    .all()
    .filter((l) => l.group === "Subscriptions & Software")
    .map((l) => ({ label: l.label, cents: l.amount }));

  return {
    today,
    apple: apple.sort((a, b) => b.entry.amount - a.entry.amount),
    appleUnclaimed,
    appleOneOffs: oneOffs.filter((c) => daysBetween(c.date, today) <= 90).map((c) => ({ date: c.date, amount: c.amount })).sort((a, b) => b.date.localeCompare(a.date)),
    direct,
    budgetLines,
  };
}

/** Every row the page can show, keyed by id, for saving a proposal the first time. */
export function findRow(id: string): SubRow | null {
  const v = getSubscriptionsView();
  return [...v.apple, ...v.appleUnclaimed, ...v.direct].find((r) => r.entry.id === id) ?? null;
}

/** For the home page: what's waiting to be cancelled or handed off. */
export function getSubscriptionToDo(): { id: string; name: string; monthlyCost: number; action: "cancel" | "transfer"; transferTo?: string }[] {
  const v = getSubscriptionsView();
  return [...v.apple, ...v.appleUnclaimed, ...v.direct]
    .filter((r) => (r.entry.status === "cancel" || r.entry.status === "transfer") && !r.looksStopped)
    .map((r) => ({
      id: r.entry.id,
      name: r.entry.name,
      monthlyCost: r.entry.cadence === "yearly" ? Math.round(r.entry.amount / 12) : r.entry.amount,
      action: r.entry.status as "cancel" | "transfer",
      transferTo: r.entry.transferTo,
    }))
    .sort((a, b) => b.monthlyCost - a.monthlyCost);
}

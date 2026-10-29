import { db, schema } from "@/lib/db";
import { and, desc, eq, gte } from "drizzle-orm";

export type AccountBalance = {
  id: string;
  name: string; // display name, institution folded in when the bank's own name is generic
  institution: string | null;
  kind: "checking" | "savings" | "card" | "other";
  balanceCents: number; // cards: what's owed
  counted: boolean; // false when excluded from reports
  lastActivity: string | null; // newest transaction date
  daysQuiet: number | null; // days since that transaction
  lastSynced: string | null;
  low30: { cents: number; date: string } | null; // lowest end-of-day balance in the last 30 days (cash accounts)
  /** False when this feed's last sync is days behind the others: a dead or disconnected connection. */
  syncing: boolean;
  /** Cards only: a payment logged on Debts after the feed's last update, which the feed hasn't caught up with. */
  paidSinceFeed: { date: string; feedBalanceCents: number } | null;
};

const SYNC_LAG_DAYS = 3;
const QUIET_DAYS = 14;
const stem = (s: string) => s.replace(/\s*\(.*\)\s*$/, "").replace(/[^a-z]/gi, "").toLowerCase();

const GENERIC = /^(checking|savings|aj|card|account)$/i;

const BANK_NAMES: Record<string, string> = { capitalone: "Capital One" };

/** The bank leads the name ("Navy Federal EveryDay Checking"), so every row says whose account it is. */
function displayName(name: string, institution: string | null): string {
  const raw = (institution ?? "").replace(/\s*\(.*\)\s*$/, "").trim();
  const inst = BANK_NAMES[raw.replace(/\s+/g, "").toLowerCase()] ?? raw;
  if (!inst) return name;
  if (GENERIC.test(name.trim())) return `${inst} ${name.toLowerCase() === "aj" ? "" : name.toLowerCase()}`.trim();
  if (stem(name).startsWith(stem(inst))) return name;
  return `${inst} ${name}`;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Every synced account, newest numbers first, with a 30-day low for cash accounts. */
export function getBalances(now: Date = new Date()): AccountBalance[] {
  const today = iso(now);
  const since = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30));
  const accounts = db.select().from(schema.accounts).all();
  const newestSync = accounts.map((a) => a.lastSynced).filter((x): x is string => !!x).sort().at(-1) ?? null;
  const debts = db.select().from(schema.debts).all();

  return accounts.map((a) => {
    const kind: AccountBalance["kind"] =
      a.accountType === "credit" ? "card" : a.subtype === "savings" ? "savings" : a.subtype === "checking" ? "checking" : "other";

    const txns = db
      .select({ date: schema.transactions.date, amount: schema.transactions.amount, type: schema.transactions.type })
      .from(schema.transactions)
      .where(and(eq(schema.transactions.accountId, a.id), gte(schema.transactions.date, since)))
      .all();
    const newest = db
      .select({ date: schema.transactions.date })
      .from(schema.transactions)
      .where(eq(schema.transactions.accountId, a.id))
      .orderBy(schema.transactions.date)
      .all()
      .at(-1)?.date ?? null;

    // Walk back from today's balance: the end of day d-1 is the end of day d minus d's net.
    const daysQuiet = newest ? Math.round((new Date(today + "T00:00:00").getTime() - new Date(newest + "T00:00:00").getTime()) / 86400000) : null;
    const syncing = !newestSync || (!!a.lastSynced && new Date(newestSync).getTime() - new Date(a.lastSynced).getTime() < SYNC_LAG_DAYS * 86400000);

    // A low worked back from a stale balance is invented, so only quiet-free feeds with activity get one.
    let low30: AccountBalance["low30"] = null;
    if (kind !== "card" && a.balance !== null && txns.length > 0 && syncing && (daysQuiet ?? 99) <= QUIET_DAYS) {
      const net = new Map<string, number>();
      for (const t of txns) net.set(t.date, (net.get(t.date) ?? 0) + (t.type === "income" ? t.amount : -t.amount));
      let bal = a.balance;
      low30 = { cents: bal, date: today };
      for (let d = new Date(now); iso(d) > since; d.setDate(d.getDate() - 1)) {
        bal -= net.get(iso(d)) ?? 0; // now the end of the previous day
        const prev = iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
        if (bal < low30.cents) low30 = { cents: bal, date: prev };
      }
    }

    // Card feeds that update monthly (Apple Card) lag a payoff by weeks. If Debts has a payment
    // dated after the feed's last activity, show the Debts balance and say why.
    let paidSinceFeed: AccountBalance["paidSinceFeed"] = null;
    let balanceCents = a.balance ?? 0;
    if (kind === "card" && a.institution) {
      const debt = debts.find((d) => stem(d.creditorName).startsWith(stem(a.institution!)) || stem(a.institution!).startsWith(stem(d.creditorName)));
      if (debt) {
        const pay = db
          .select({ date: schema.debtPayments.date })
          .from(schema.debtPayments)
          .where(eq(schema.debtPayments.debtId, debt.id))
          .orderBy(desc(schema.debtPayments.date))
          .get();
        if (pay && (!newest || pay.date > newest) && debt.currentBalance !== balanceCents) {
          paidSinceFeed = { date: pay.date, feedBalanceCents: balanceCents };
          balanceCents = debt.currentBalance;
        }
      }
    }

    return {
      id: a.id,
      name: displayName(a.name, a.institution),
      institution: a.institution,
      kind,
      balanceCents,
      counted: !a.excludeFromReports,
      lastActivity: newest,
      daysQuiet,
      lastSynced: a.lastSynced,
      low30,
      syncing,
      paidSinceFeed,
    };
  });
}

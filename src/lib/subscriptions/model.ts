/**
 * Subscription management — shared types and pure helpers (client-safe).
 *
 * Every subscription is an Entry in one registry, saved in `settings`. Bank
 * charges are matched to entries: an Apple entry by amount (Apple bills
 * everything as "Apple"), anything else by its merchant key. Charges that
 * look recurring but match nothing show up as unclaimed, to be named.
 */

export type Status = "keep" | "transfer" | "cancel" | "transferred" | "cancelled";

export const STATUS_LABEL: Record<Status, string> = {
  keep: "Keep",
  transfer: "Hand off",
  cancel: "Cancel",
  transferred: "Handed off",
  cancelled: "Cancelled",
};

/** Still costing money: kept, or waiting on a cancel or a hand-off. */
export const RUNNING: Status[] = ["keep", "transfer", "cancel"];
/** Something to do. */
export const TO_DO: Status[] = ["transfer", "cancel"];
/** Done and off the books. */
export const DONE: Status[] = ["transferred", "cancelled"];

export type Entry = {
  /** "apple:<cents>" for Apple, "m:<MERCHANT KEY>" for everything else. */
  id: string;
  provider: "apple" | "direct";
  name: string;
  /** What exactly it is: "iCloud+ with 2 TB storage". */
  detail?: string;
  /** Current price, cents. */
  amount: number;
  /** Earlier prices that still identify it (Apple raises prices in place). */
  priceHistory?: number[];
  cadence: "monthly" | "yearly";
  /** Next renewal the provider shows, YYYY-MM-DD. Rolled forward by cadence once past. */
  renewsOn?: string;
  status: Status;
  /** When it moved to cancelled / handed off, YYYY-MM-DD. Charges after this are a problem. */
  statusDate?: string;
  /** Who or what it's for: "Simon or Abel's iPhone 14 Pro". */
  forWhom?: string;
  /** Who should take it over when the status is a hand-off. */
  transferTo?: string;
  /** Someone who pays part of it. */
  sharedWith?: string;
  theirSharePct?: number;
  note?: string;
  manageUrl?: string;
  /** Schedule rows switched off when this was cancelled, so they can come back. */
  pausedScheduleIds?: string[];
};

export type Registry = { entries: Entry[]; dismissed: string[] };

export const EMPTY_REGISTRY: Registry = { entries: [], dismissed: [] };

export const APPLE_MANAGE_URL = "https://apps.apple.com/account/subscriptions";

/** Account pages we're confident about. Anything else takes a link typed in. */
export const KNOWN_MANAGE_URLS: Record<string, string> = {
  HULU: "https://secure.hulu.com/account",
  "DISNEY+": "https://www.disneyplus.com/account",
  DROPBOX: "https://www.dropbox.com/account/plan",
  NETFLIX: "https://www.netflix.com/account",
};

export function monthlyCents(e: Pick<Entry, "amount" | "cadence">): number {
  return e.cadence === "yearly" ? Math.round(e.amount / 12) : e.amount;
}

/** What it costs you each month after anyone's share. */
export function yourMonthlyCents(e: Pick<Entry, "amount" | "cadence" | "theirSharePct">): number {
  const share = Math.min(100, Math.max(0, e.theirSharePct ?? 0));
  return Math.round(monthlyCents(e) * (1 - share / 100));
}

/** The next renewal on or after today, stepping a stale date forward by cadence. */
export function nextRenewal(renewsOn: string | undefined, cadence: Entry["cadence"], today: string): string | null {
  if (!renewsOn) return null;
  const d = new Date(renewsOn + "T00:00:00");
  const anchor = d.getDate();
  for (let i = 0; i < 60 && iso(d) < today; i++) {
    if (cadence === "yearly") d.setFullYear(d.getFullYear() + 1);
    else {
      d.setDate(1);
      d.setMonth(d.getMonth() + 1);
      d.setDate(Math.min(anchor, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    }
  }
  return iso(d);
}

export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** One row on the page: an entry (saved or proposed) plus what the bank shows for it. */
export type SubRow = {
  entry: Entry;
  saved: boolean;
  /** Matched charges, newest first, last 180 days. */
  charges: { date: string; amount: number }[];
  lastCharged: string | null;
  nextExpected: string | null;
  /** Derived for unsaved rows: no charge for long enough that it has likely stopped. */
  looksStopped: boolean;
  /** Cancelled or handed off, yet charged after that date. */
  stillCharging: { date: string; amount: number } | null;
  /** Cancelled / handed off, and its billing date has passed with no charge. */
  confirmedStopped: boolean;
  /** The account it bills to has gone quiet, so a missing charge proves nothing. */
  accountQuiet: string | null;
};

export type SubscriptionsView = {
  today: string;
  apple: SubRow[];
  /** Apple amounts that keep billing but aren't on the list. */
  appleUnclaimed: SubRow[];
  /** Apple charges that don't repeat: purchases, or renewals billed together. */
  appleOneOffs: { date: string; amount: number }[];
  direct: SubRow[];
  /** The budget's subscription lines, for comparison. */
  budgetLines: { label: string; cents: number }[];
};

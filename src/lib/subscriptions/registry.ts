import { db, schema } from "@/lib/db";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { now } from "@/lib/utils/format";
import { newId } from "@/lib/utils/ids";
import { normalizeMerchantKey } from "@/lib/utils/merchant";
import { brandKey } from "./brand";
import { DONE, EMPTY_REGISTRY, TO_DO, iso, type Entry, type Registry, type Status } from "./model";

/** The subscription registry lives in settings, like the plan and the working budget. */
const KEY = "subscription_registry";

const status = z.enum(["keep", "transfer", "cancel", "transferred", "cancelled"]);
const text = (max: number) => z.string().trim().max(max);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const entrySchema = z.object({
  id: z.string().regex(/^(apple:\d+|m:.+)$/).max(120),
  provider: z.enum(["apple", "direct"]),
  name: text(120).min(1),
  detail: text(200).optional(),
  amount: z.number().int().min(0).max(10_000_000),
  priceHistory: z.array(z.number().int().min(0)).max(20).optional(),
  cadence: z.enum(["monthly", "yearly"]),
  renewsOn: date.optional(),
  status,
  statusDate: date.optional(),
  forWhom: text(200).optional(),
  transferTo: text(120).optional(),
  sharedWith: text(120).optional(),
  theirSharePct: z.number().min(0).max(100).optional(),
  note: text(1000).optional(),
  manageUrl: z.url().max(500).optional(),
  pausedScheduleIds: z.array(z.string()).max(50).optional(),
});

/** What the page may change on an entry. */
export const patchSchema = entrySchema
  .omit({ id: true, provider: true, pausedScheduleIds: true })
  .partial()
  .extend({
    // Empty strings clear optional fields.
    detail: z.string().max(200).optional(),
    forWhom: z.string().max(200).optional(),
    transferTo: z.string().max(120).optional(),
    sharedWith: z.string().max(120).optional(),
    note: z.string().max(1000).optional(),
    manageUrl: z.union([z.url().max(500), z.literal("")]).optional(),
    renewsOn: z.union([date, z.literal("")]).optional(),
  });

const registrySchema = z.object({ entries: z.array(entrySchema), dismissed: z.array(z.string()) });

export function getRegistry(): Registry {
  const row = db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, KEY)).get();
  if (!row) return EMPTY_REGISTRY;
  try {
    const parsed = registrySchema.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : EMPTY_REGISTRY;
  } catch {
    return EMPTY_REGISTRY;
  }
}

function saveRegistry(r: Registry) {
  const value = JSON.stringify(r);
  db.insert(schema.settings)
    .values({ key: KEY, value, updatedAt: now() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: now() } })
    .run();
}

/**
 * Save an entry. `base` is what the page showed (a saved entry, or one
 * proposed from the bank charges); `patch` is the change. When the status
 * crosses into or out of done, the rest of Bud follows: Reports' cancel and
 * kill-list tags, and the recurring schedule rows for that merchant.
 */
export function saveEntry(base: Entry, patch: z.infer<typeof patchSchema>): Entry {
  const reg = getRegistry();
  const prev = reg.entries.find((e) => e.id === base.id) ?? base;
  const next: Entry = { ...prev };
  for (const [k, v] of Object.entries(patch) as [keyof Entry, unknown][]) {
    if (v === "" || v === undefined) {
      if (v === "") delete next[k];
      continue;
    }
    (next as Record<string, unknown>)[k] = v;
  }

  const wasDone = DONE.includes(prev.status);
  const isDone = DONE.includes(next.status);
  if (isDone && (!wasDone || !next.statusDate)) next.statusDate = patch.statusDate ?? iso(new Date());
  if (!isDone) delete next.statusDate;

  if (next.provider === "direct") {
    const key = next.id.slice(2).replace(/@\d+$/, "");
    syncTags(key, next.status);
    if (isDone && !wasDone) next.pausedScheduleIds = pauseSchedule(key);
    if (!isDone && wasDone && prev.pausedScheduleIds?.length) {
      db.update(schema.recurringTransactions).set({ isActive: true }).where(inArray(schema.recurringTransactions.id, prev.pausedScheduleIds)).run();
      delete next.pausedScheduleIds;
    }
  }

  entrySchema.parse(next);
  reg.entries = [...reg.entries.filter((e) => e.id !== next.id), next];
  reg.dismissed = reg.dismissed.filter((d) => d !== next.id);
  saveRegistry(reg);
  return next;
}

/** Forget a saved entry; the bank charges will propose it again if they continue. */
export function removeEntry(id: string) {
  const reg = getRegistry();
  const e = reg.entries.find((x) => x.id === id);
  if (e?.pausedScheduleIds?.length) {
    db.update(schema.recurringTransactions).set({ isActive: true }).where(inArray(schema.recurringTransactions.id, e.pausedScheduleIds)).run();
  }
  reg.entries = reg.entries.filter((x) => x.id !== id);
  saveRegistry(reg);
}

/** Not a subscription: hide this proposal. */
export function dismiss(id: string) {
  const reg = getRegistry();
  if (!reg.dismissed.includes(id)) reg.dismissed.push(id);
  reg.entries = reg.entries.filter((x) => x.id !== id);
  saveRegistry(reg);
}

export function seedEntries(entries: Entry[]) {
  const reg = getRegistry();
  for (const e of entries) {
    entrySchema.parse(e);
    reg.entries = [...reg.entries.filter((x) => x.id !== e.id), e];
  }
  saveRegistry(reg);
}

// --- keeping the rest of Bud in step -------------------------------------

function keyOf(merchant: string | null, description: string | null): string {
  return brandKey(normalizeMerchantKey(merchant ?? "") || normalizeMerchantKey(description ?? ""));
}

function sameMerchant(a: string, b: string): boolean {
  return a === b || a.startsWith(b + " ") || b.startsWith(a + " ");
}

/** Reports reads #cancel (done) and #kill-list (to do) per transaction; mirror the status there. */
function syncTags(key: string, s: Status) {
  const want = { cancel: DONE.includes(s), "kill-list": TO_DO.includes(s) };
  const txIds = db
    .select({ id: schema.transactions.id, merchant: schema.transactions.merchant, description: schema.transactions.description })
    .from(schema.transactions)
    .where(eq(schema.transactions.type, "expense"))
    .all()
    .filter((t) => sameMerchant(keyOf(t.merchant, t.description), key))
    .map((t) => t.id);
  if (txIds.length === 0) return;
  for (const [name, on] of Object.entries(want)) {
    let tag = db.select().from(schema.tags).where(eq(schema.tags.name, name)).get();
    if (!tag && !on) continue;
    if (!tag) {
      tag = { id: newId(), name, color: "#dc2626", createdAt: now() };
      db.insert(schema.tags).values(tag).run();
    }
    const has = new Set(
      db.select({ t: schema.transactionTags.transactionId }).from(schema.transactionTags)
        .where(and(eq(schema.transactionTags.tagId, tag.id), inArray(schema.transactionTags.transactionId, txIds)))
        .all().map((r) => r.t),
    );
    if (on) {
      for (const id of txIds) if (!has.has(id)) db.insert(schema.transactionTags).values({ id: newId(), transactionId: id, tagId: tag.id, createdAt: now() }).run();
    } else if (has.size > 0) {
      db.delete(schema.transactionTags).where(and(eq(schema.transactionTags.tagId, tag.id), inArray(schema.transactionTags.transactionId, [...has]))).run();
    }
  }
}

/** A cancelled subscription shouldn't keep landing on Next month. Returns the rows switched off. */
function pauseSchedule(key: string): string[] {
  const rows = db
    .select({ id: schema.recurringTransactions.id, merchant: schema.recurringTransactions.merchant })
    .from(schema.recurringTransactions)
    .where(eq(schema.recurringTransactions.isActive, true))
    .all()
    .filter((r) => sameMerchant(brandKey(normalizeMerchantKey(r.merchant.replace(/\s+—.*$/, ""))), key));
  const ids = rows.map((r) => r.id);
  if (ids.length) db.update(schema.recurringTransactions).set({ isActive: false }).where(inArray(schema.recurringTransactions.id, ids)).run();
  return ids;
}


import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod/v4";
import { entrySchema, patchSchema, saveEntry, removeEntry, dismiss, getRegistry, seedEntries } from "@/lib/subscriptions/registry";
import { findRow } from "@/lib/subscriptions/view";

const patchBody = z.object({ id: z.string().min(1).max(120), patch: patchSchema });
const idBody = z.object({ id: z.string().min(1).max(120) });

/** Change a subscription. A proposal from the bank charges is saved the first time it's touched. */
export async function PATCH(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();
  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const parsed = patchBody.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  const { id, patch } = parsed.data;
  const base = getRegistry().entries.find((e) => e.id === id) ?? findRow(id)?.entry;
  if (!base) return Response.json({ error: "No such subscription" }, { status: 404 });
  try {
    return Response.json({ success: true, entry: saveEntry(base, patch) });
  } catch (e) {
    return Response.json({ error: "Invalid input", detail: String(e) }, { status: 400 });
  }
}

/** Forget a saved subscription (it comes back as a proposal if it keeps charging). */
export async function DELETE(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();
  const parsed = idBody.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 });
  removeEntry(parsed.data.id);
  return Response.json({ success: true });
}

const postBody = z.union([
  z.object({ dismiss: z.string().min(1).max(120) }),
  z.object({ create: z.array(entrySchema).min(1).max(50) }),
]);

/** Add subscriptions by hand (ones the bank hasn't billed yet), or stop proposing something that isn't one. */
export async function POST(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();
  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;
  const parsed = postBody.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  if ("dismiss" in parsed.data) dismiss(parsed.data.dismiss);
  else seedEntries(parsed.data.create);
  return Response.json({ success: true });
}

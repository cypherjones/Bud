import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { now } from "@/lib/utils/format";
import { newId } from "@/lib/utils/ids";
import { encrypt } from "@/lib/utils/crypto";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { claimSetupToken } from "@/lib/sync/simplefin";
import { z } from "zod/v4";

export const runtime = "nodejs";

const simplefinSchema = z.object({
  setup_token: z.string().min(10).max(2000),
});

export async function GET(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();

  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const connections = db
    .select({
      id: schema.simplefinConnections.id,
      name: schema.simplefinConnections.name,
      lastSynced: schema.simplefinConnections.lastSynced,
      createdAt: schema.simplefinConnections.createdAt,
    })
    .from(schema.simplefinConnections)
    .all();

  return Response.json({
    connected: connections.length > 0,
    connections,
  });
}

export async function POST(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();

  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const body = await req.json();
  const parsed = simplefinSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  // Claim the setup token (one-time operation) → durable access URL.
  let accessUrl: string;
  try {
    accessUrl = await claimSetupToken(parsed.data.setup_token);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Claim failed";
    return Response.json({ error: message }, { status: 400 });
  }

  db.insert(schema.simplefinConnections)
    .values({
      id: newId(),
      accessUrl: encrypt(accessUrl),
      name: "SimpleFIN",
      createdAt: now(),
    })
    .run();

  return Response.json({ success: true });
}

export async function DELETE(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();

  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  db.delete(schema.simplefinConnections)
    .where(eq(schema.simplefinConnections.id, id))
    .run();

  return Response.json({ success: true });
}

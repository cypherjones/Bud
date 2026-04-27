import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { now } from "@/lib/utils/format";
import { encrypt } from "@/lib/utils/crypto";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod/v4";

const tellerSchema = z.object({
  access_token: z.string().min(1).max(500),
  enrollment_id: z.string().max(500).optional(),
});

export async function GET(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();

  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const token = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "teller_access_token"))
    .get();

  return Response.json({ connected: !!token });
}

export async function POST(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();

  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const body = await req.json();
  const parsed = tellerSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const { access_token, enrollment_id } = parsed.data;
  const timestamp = now();

  // Encrypt the access token before storing
  const encryptedToken = encrypt(access_token);

  // Upsert access token
  const existing = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "teller_access_token"))
    .get();

  if (existing) {
    db.update(schema.settings)
      .set({ value: encryptedToken, updatedAt: timestamp })
      .where(eq(schema.settings.key, "teller_access_token"))
      .run();
  } else {
    db.insert(schema.settings)
      .values({
        key: "teller_access_token",
        value: encryptedToken,
        updatedAt: timestamp,
      })
      .run();
  }

  // Upsert enrollment ID (encrypted)
  if (enrollment_id) {
    const encryptedEnrollment = encrypt(enrollment_id);
    const existingEnr = db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "teller_enrollment_id"))
      .get();

    if (existingEnr) {
      db.update(schema.settings)
        .set({ value: encryptedEnrollment, updatedAt: timestamp })
        .where(eq(schema.settings.key, "teller_enrollment_id"))
        .run();
    } else {
      db.insert(schema.settings)
        .values({
          key: "teller_enrollment_id",
          value: encryptedEnrollment,
          updatedAt: timestamp,
        })
        .run();
    }
  }

  return Response.json({ success: true });
}

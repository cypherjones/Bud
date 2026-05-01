import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { now } from "@/lib/utils/format";
import { newId } from "@/lib/utils/ids";
import { encrypt } from "@/lib/utils/crypto";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod/v4";

const tellerSchema = z.object({
  access_token: z.string().min(1).max(500),
  enrollment_id: z.string().min(1).max(500),
  institution: z.string().min(1).max(200),
});

export async function GET(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();

  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const enrollments = db
    .select({
      id: schema.tellerEnrollments.id,
      enrollmentId: schema.tellerEnrollments.enrollmentId,
      institution: schema.tellerEnrollments.institution,
      createdAt: schema.tellerEnrollments.createdAt,
    })
    .from(schema.tellerEnrollments)
    .all();

  return Response.json({
    connected: enrollments.length > 0,
    enrollments,
  });
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

  const { access_token, enrollment_id, institution } = parsed.data;

  // Check if this enrollment already exists
  const existing = db
    .select()
    .from(schema.tellerEnrollments)
    .where(eq(schema.tellerEnrollments.enrollmentId, enrollment_id))
    .get();

  if (existing) {
    // Update the access token (may have been refreshed)
    db.update(schema.tellerEnrollments)
      .set({ accessToken: encrypt(access_token) })
      .where(eq(schema.tellerEnrollments.id, existing.id))
      .run();
  } else {
    db.insert(schema.tellerEnrollments)
      .values({
        id: newId(),
        enrollmentId: enrollment_id,
        accessToken: encrypt(access_token),
        institution,
        createdAt: now(),
      })
      .run();
  }

  return Response.json({ success: true });
}

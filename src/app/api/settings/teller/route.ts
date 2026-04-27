import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { now } from "@/lib/utils/format";

export async function GET() {
  const token = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "teller_access_token"))
    .get();

  return Response.json({ connected: !!token });
}

export async function POST(req: Request) {
  const { access_token, enrollment_id } = await req.json();

  if (!access_token) {
    return Response.json({ error: "Access token required" }, { status: 400 });
  }

  const timestamp = now();

  // Upsert access token
  const existing = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "teller_access_token"))
    .get();

  if (existing) {
    db.update(schema.settings)
      .set({ value: JSON.stringify(access_token), updatedAt: timestamp })
      .where(eq(schema.settings.key, "teller_access_token"))
      .run();
  } else {
    db.insert(schema.settings)
      .values({
        key: "teller_access_token",
        value: JSON.stringify(access_token),
        updatedAt: timestamp,
      })
      .run();
  }

  // Upsert enrollment ID
  if (enrollment_id) {
    const existingEnr = db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "teller_enrollment_id"))
      .get();

    if (existingEnr) {
      db.update(schema.settings)
        .set({ value: JSON.stringify(enrollment_id), updatedAt: timestamp })
        .where(eq(schema.settings.key, "teller_enrollment_id"))
        .run();
    } else {
      db.insert(schema.settings)
        .values({
          key: "teller_enrollment_id",
          value: JSON.stringify(enrollment_id),
          updatedAt: timestamp,
        })
        .run();
    }
  }

  return Response.json({ success: true });
}

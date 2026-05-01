import { authenticateRequest, unauthorizedResponse } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { mergeDuplicates } from "@/lib/actions/transactions";
import { z } from "zod/v4";

const mergeSchema = z.object({
  keeperId: z.string().min(1),
  loserIds: z.array(z.string().min(1)).min(1),
});

export async function POST(req: Request) {
  if (!authenticateRequest(req)) return unauthorizedResponse();

  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const body = await req.json();
  const parsed = mergeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const result = mergeDuplicates(parsed.data.keeperId, parsed.data.loserIds);
    return Response.json({ success: true, ...result });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Merge failed" },
      { status: 400 },
    );
  }
}

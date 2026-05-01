/**
 * Validate the request API key against the stored key.
 * Returns true if valid, false otherwise.
 *
 * The API key is expected in the Authorization header as: Bearer <key>
 */
export function authenticateRequest(req: Request): boolean {
  const apiKey = process.env.BUD_API_KEY;

  // If no API key is configured, reject all requests in production
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") return false;
    // In development, allow requests if no key is set (first-run experience)
    return true;
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return false;

  const token = authHeader.replace("Bearer ", "");
  return timingSafeEqual(token, apiKey);
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return require("node:crypto").timingSafeEqual(bufA, bufB);
}

/**
 * Return a 401 JSON response.
 */
export function unauthorizedResponse(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

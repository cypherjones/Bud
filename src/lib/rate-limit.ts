const windowMs = 60_000; // 1 minute
const maxRequests: Record<string, number> = {
  "/api/chat": 20,
  "/api/sync": 5,
  "/api/settings/teller": 10,
};
const defaultMax = 30;

type Entry = { count: number; resetAt: number };
const store = new Map<string, Entry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 300_000).unref();

/**
 * Check rate limit for a given route.
 * Returns null if allowed, or a Response if rate limited.
 */
export function checkRateLimit(req: Request): Response | null {
  const url = new URL(req.url);
  const path = url.pathname;
  const ip = req.headers.get("x-forwarded-for") ?? "127.0.0.1";
  const key = `${ip}:${path}`;
  const max = maxRequests[path] ?? defaultMax;
  const now = Date.now();

  const entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  entry.count++;
  if (entry.count > max) {
    return Response.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)) },
      }
    );
  }

  return null;
}

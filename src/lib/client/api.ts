/**
 * Authenticated fetch wrapper for client-side API calls.
 * Automatically includes the Bearer token.
 */
export function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const apiKey = process.env.NEXT_PUBLIC_BUD_API_KEY;
  const headers = new Headers(init?.headers);

  if (apiKey) {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }

  return fetch(url, { ...init, headers });
}

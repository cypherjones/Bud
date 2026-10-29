/**
 * One key per brand. Bank feeds name the same merchant several ways
 * ("Kinsta" / "Kinsta London", "DISNEY PLUS" / "Disney+", "PLUS.EXCALIDRAW.COM"),
 * so the brand is the first word, cleaned. Apple's own billing names fold into APPLE.
 */
export function brandKey(key: string): string {
  let k = key.toUpperCase().trim();
  if (/^APPLE(\.COM|\s+COM)?(\/BILL|\s+BILL)?$/.test(k) || /^APPLE\.COM/.test(k)) return "APPLE";
  k = k.replace(/^PLUS\./, "").replace(/^WWW\./, "");
  const aliases: Record<string, string> = { NYTIMES: "NEW YORK TIMES", DOORDASHDASHPASS: "DOORDASH", "DISNEY PLUS": "DISNEY+" };
  for (const [from, to] of Object.entries(aliases)) if (k.startsWith(from)) return to;
  if (k.startsWith("NEW YORK TIMES")) return "NEW YORK TIMES";
  const first = k.split(/\s+/)[0].replace(/\.(COM|IO|AI|APP|NET|ORG).*$/, "").replace(/[^A-Z0-9+]/g, "");
  return first || k;
}

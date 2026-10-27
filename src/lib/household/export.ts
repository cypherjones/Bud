/**
 * The budget as a note — just the plan and its numbers, for Apple Notes.
 * Plain text for the iPhone share sheet, HTML (with real tables) for pasting
 * into Notes on a Mac. Pure; safe on the client.
 */
import { budgetTotals, lineAmount, type HouseholdLine, type Income, type LineOwner } from "./calc";

const WHO: Record<LineOwner, string> = { his: "AJ", hers: "April", both: "Shared" };

const usd = (dollars: number) =>
  (dollars < 0 ? "−" : "") +
  "$" +
  Math.abs(Math.round(dollars)).toLocaleString("en-US");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function budgetNote(lines: HouseholdLine[], income: Income, savingsBalanceDollars: number | null, asOf = new Date()) {
  const totals = budgetTotals(lines, income);
  const dated = asOf.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });

  const comingIn: Array<[string, number]> = [
    ["AJ's take-home", income.hisNet],
    ...(income.herNet ? [["April's take-home", income.herNet] as [string, number]] : []),
    ...(income.draw ? [["Meridian draw", income.draw] as [string, number]] : []),
    ["Simon and Frank", income.boys],
  ];

  const groups = new Map<string, HouseholdLine[]>();
  for (const l of [...lines].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!groups.has(l.groupName)) groups.set(l.groupName, []);
    groups.get(l.groupName)!.push(l);
  }

  // ---- plain text ----
  const t: string[] = [`Our budget`, `As of ${dated}`, ``, `COMING IN`];
  for (const [label, v] of comingIn) t.push(`${label}: ${usd(v)}`);
  t.push(`Total: ${usd(totals.moneyIn)}`, ``, `SAVING`, `Into savings each month: ${usd(totals.savings)}`);
  if (savingsBalanceDollars !== null) t.push(`In savings now: ${usd(savingsBalanceDollars)}`);
  for (const [group, ls] of groups) {
    const sub = ls.reduce((s, l) => s + lineAmount(l, income), 0);
    t.push(``, `${group.toUpperCase()} — ${usd(sub)}`);
    for (const l of ls) t.push(`• ${l.label}: ${usd(lineAmount(l, income))} (${WHO[l.owner]})`);
  }
  t.push(
    ``,
    `TOTALS`,
    `Bills: ${usd(totals.out)}`,
    `AJ ${usd(totals.his)} · April ${usd(totals.hers)} · Shared ${usd(totals.both)}`,
    `Savings: ${usd(totals.savings)}`,
    `Left over: ${usd(totals.net)}`,
  );

  // ---- HTML ----
  const row = (a: string, b: string, c = "", bold = false) => {
    const cell = (x: string, right = false) =>
      `<td style="padding:2px 10px 2px 0;${right ? "text-align:right;" : ""}">${bold ? `<b>${x}</b>` : x}</td>`;
    return `<tr>${cell(esc(a))}${cell(b, true)}${c ? cell(esc(c)) : ""}</tr>`;
  };
  const h: string[] = [`<h1>Our budget</h1>`, `<p>As of ${dated}</p>`, `<h2>Coming in</h2><table>`];
  for (const [label, v] of comingIn) h.push(row(label, usd(v)));
  h.push(row("Total", usd(totals.moneyIn), "", true), `</table>`, `<h2>Saving</h2><table>`);
  h.push(row("Into savings each month", usd(totals.savings)));
  if (savingsBalanceDollars !== null) h.push(row("In savings now", usd(savingsBalanceDollars)));
  h.push(`</table>`);
  for (const [group, ls] of groups) {
    const sub = ls.reduce((s, l) => s + lineAmount(l, income), 0);
    h.push(`<h2>${esc(group)} — ${usd(sub)}</h2><table>`);
    for (const l of ls) h.push(row(l.label, usd(lineAmount(l, income)), WHO[l.owner]));
    h.push(`</table>`);
  }
  h.push(`<h2>Totals</h2><table>`);
  h.push(row("Bills", usd(totals.out)), row("AJ", usd(totals.his)), row("April", usd(totals.hers)), row("Shared", usd(totals.both)));
  h.push(row("Savings", usd(totals.savings)), row("Left over", usd(totals.net), "", true), `</table>`);

  return { title: `Our budget — ${dated}`, text: t.join("\n"), html: h.join("") };
}

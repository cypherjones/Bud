# Bud — Product Brief

*Living doc. Last updated 2026-04-30.*

## Vision

Bud is a **personal money copilot** for one user. Two co-equal interfaces:

1. **An honest dashboard** that answers *"how am I doing?"* in under five seconds, with no setup ritual.
2. **An AI chat** that knows the full financial picture cold and gives specific, grounded recommendations — not generic advice.

**Phase-1 mission:** get out of debt and start generating savings. Every feature is judged against that lens. Anything that doesn't make the dashboard more trustworthy, the AI more useful, or the debt-payoff/savings loop tighter is not phase-1.

Single-user. Local-first (SQLite). No SaaS gymnastics.

---

## State of the union (audit, 2026-04-30)

The app is roughly **75% built** — way more than it looks at first glance. The bones are there; the connective tissue isn't.

### What's solid

| Area | Why it's solid |
|---|---|
| **Money plumbing** | Teller sync works (mTLS, encrypted tokens, auto-categorize). Transactions page is real. Budgets page computes spent-vs-budgeted from real data. Dedup via 14-day placeholder TTL is clever. |
| **Debt engine** | The math is *sophisticated* — multi-objective scoring (interest 30%, utilization 25%, goal-unlocking 20%, penalty 15%, quick-win 10%) with surplus distribution. This is the crown jewel. |
| **Dashboard aggregates** | Home page pulls real metrics — spending by category, debt summary, credit summary, tax summary, spending velocity, upcoming bills. No mocks. |
| **Schedule / cash flow** | Calendar, 30-day timeline, day-by-day projection — all from real recurring transactions. |
| **Move planner & goals (read)** | Reads from `financialPlans` and `savingsGoals` correctly. Progress bars are real. |
| **AI chat** | 20+ tools defined (transactions, debts, taxes, credit, goals, plans). All handlers wired to the DB. The AI can mutate state. |
| **Auth + infra** | Single-user API-key auth with timing-safe compare. Rate limit. Production guardrails. Fine for the audience. |

### What's half-baked

| Area | Gap |
|---|---|
| **Reports** | Monthly summary, velocity, trends, cash flow forecast, subscription audit all work. **Frivolous-spending detection** and **tax-deduction report** are stubs that return empty. |
| **Goals / plans (write)** | You can *see* goals but can't *create or edit* them in the UI — only via chat. Same for line items. |
| **Debts page** | Beautifully shows the allocation plan and reasoning. But you can't log an actual payment from the page — you have to chat. |

### What's missing

| Area | Reality |
|---|---|
| **Tax page** | Doesn't exist. Schema is complete, dashboard card works, but there's no page to enter or edit a tax obligation. Everything routes through chat. |
| **Credit page** | Empty scaffold. No score-history chart. No entry form. The dashboard widget shows latest + delta, but the dedicated page is a placeholder. |
| **Direct-entry forms generally** | Across the recovery surface (debts, taxes, credit, goals), the only way to *input* data is via the chat. This breaks the "two co-equal interfaces" vision — right now the chat isn't co-equal, it's *required*. |

### The single biggest disconnect

The chat interface isn't a *copilot* — it's a *bottleneck*. The user opens the debt page, sees a smart allocation plan, and… can't log a payment without typing a sentence to the AI. That's not a copilot relationship; that's the AI as a substitute for forms. The vision says "honest dashboard AND AI chat" — right now it's "AI chat OR a read-only dashboard."

---

## Where to focus next

### My recommendation: close the **debt-payoff feedback loop** end-to-end first

Three reasons this is the right phase-1 milestone:

1. **It is the mission.** Get out of debt + savings. The debt engine is the most sophisticated thing in this codebase. Right now it can recommend, but it can't *learn from what actually happened* because the actual-payment side is hard to log. Closing that loop is highest-leverage in dollars-per-line-of-code.
2. **It directly tests the "tie it all together" thesis.** A debt payment touches transactions (a real charge appears on sync), debt balances (manual log), allocations (compare recommended vs. actual), and the dashboard (debt-progress widget refreshes). If we can make *one* loop close cleanly across all of those, we've proven the integration pattern for taxes and goals next.
3. **The AI gets sharper for free.** Once the system has *recommended* and *actual* allocation data, the chat can stop giving generic advice ("consider paying down high-interest first") and start saying real things ("you under-paid Citi by $80 last month, here's what shifts in May").

**Concrete scope for milestone 1 (1–2 weeks of focused work):**

- A "Log payment" button on the debts page that opens a dialog, hits a server action, writes a `debtPayments` row, recalculates `currentBalance`, and refreshes the page.
- Auto-link the payment to a recent transaction if one matches (amount + creditor merchant within 7 days). This is where transactions × debts integrate.
- A "This month: recommended vs. actual" strip on the debts page, sourced from `debtAllocations` joined to `debtPayments`.
- Update the dashboard `debt-progress` widget to show same-month progress against allocation, not just total balance.
- Add a chat tool `summarize_debt_month` so the AI can narrate the same view.
- Stretch: surface upcoming credit-card statement-close dates so utilization isn't a surprise.

### Then: bring **taxes** and **credit** up to dashboard parity

Same pattern, applied twice:

- **Tax page** with a list of obligations, an "Add obligation" dialog, an "Log payment" dialog, an installment tracker, and a "next due" callout. Server actions. The AI tools already exist — wrap them in UI.
- **Credit page** with score-history chart (you already have `creditScores` over time), a "Log new score" dialog, and a factors snapshot. This is a half-day of work and gives a motivating progress curve.

Doing these in the same shape as the debt page enforces a pattern: every recovery surface = read view + write dialogs + chat tool that narrates the view. That pattern is the integration spine.

### Then: **savings generator**

Phase-1 is debt + savings, and the savings half is currently the weakest. After milestones 1–2:

- Auto-suggest a "savings target this month" on the dashboard, computed as: forecasted income − fixed bills − debt allocation − discretionary buffer.
- Close the loop: when an actual transfer to savings posts, link it to a `savingsGoals` row.
- Wire the frivolous-spending and subscription-audit reports up so the AI can say *"cancelling these three subscriptions would fund $42/mo of your savings target."* Concrete ROI, not generic advice.

### Last in phase 1: make the AI **proactively useful**

Don't do this until milestones 1–3 are done. The reason: the AI is only as useful as the data it can see. Once the loops are closed, give it:

- A system prompt that injects a current-state snapshot at session start (balances, allocation status this month, next bills, top variances vs. budget).
- A "morning brief" tool that produces the same digest in chat or as a saved artifact.
- A weekly check-in that compares the past week to the plan and proposes adjustments.

---

## What I'm explicitly de-prioritizing for phase 1

- **Move planner polish.** It already works. Revisit only if you actually have a move on the calendar.
- **CLI features.** Audit didn't read these in detail; the web UX is the priority.
- **Multi-user / SaaS architecture.** You said "just me." Don't pay this tax.
- **Transaction-edit power features** (bulk re-categorize, splits, transfers between accounts). They're nice but not on the debt-payoff critical path.
- **Tax-deduction report.** Real tax-prep is a project unto itself; defer until next tax season is on the horizon.

---

## Roadmap at a glance

| Milestone | Outcome | Status |
|---|---|---|
| **M1 — Close the debt loop** | Log payments from UI, link to real Teller transactions, recommended-vs-actual visible, dashboard reflects same-month progress, "since-last-visit" strip, lightweight tax-obligation entry dialog | **shipped 2026-04-30** |
| **M2 — Tax & credit page parity** | Both pages have read view + write dialogs + chat tool, in the same shape as debts | 1 week |
| **M3 — Savings generator** | Monthly savings target on dashboard, frivolous/subscription reports wired, AI cites concrete ROI | 1 week |
| **M4 — Proactive AI** | System prompt has live state snapshot, morning brief, weekly check-in | 3–5 days |
| *Future (post phase-1)* | Move planner polish, deeper transaction tools, tax-prep, multi-account households | — |

### M1 — what we learned

- **Migration baseline gap.** The repo has no `drizzle/` migrations checked in despite having `db:generate` / `db:migrate` scripts. The `linkedTransactionId` column was added via direct ALTER + schema edit (matching the project's actual workflow). Bootstrapping a baseline migration is a one-time chore that should happen before M2 so future schema changes ship with reviewable SQL.
- **React 19 / Next 16 purity rules are strict.** `Date.now()` during a server-or-client component render is now a hard ESLint error (`react-hooks/purity`). Time-of-render logic has to be either computed in a regular function (server action / utility) or moved into an effect that only updates external systems. The "since-last-visit" strip uses the former pattern: `getSinceLastVisit()` returns a precomputed `staleEnoughToShow` boolean.
- **Match-tolerance default is fine for the seeded data.** ±7 days / ±1% (with $1 floor) gave one clean candidate per logged payment in spot-check. Tighten to ±3 days if false positives crop up once real payment volume hits.
- **Allocation snap on month rollover** worked as designed: first call to `getMonthlyAllocationVsActual` for a new month writes the recommended row to `debtAllocations` so the dashboard, debts page, and AI tool all read the same numbers.

---

## Calls I'm making on your behalf

These are the spots where I picked an answer rather than asking you. Push back on any of them.

1. **Debt loop is milestone 1, not "make the dashboard prettier" or "make AI smarter."** Reasoning: it's the only one of those three that *changes what data exists in the system* — the other two are derivative.
2. **Forms-and-buttons UI for direct entry, even though you have a chat.** Reasoning: chat-only mutation makes the chat a chore, not a copilot. A copilot suggests; a form captures. They're different jobs.
3. **No new schema work in phase 1.** The data model is already excellent. Every milestone above is wiring, UI, and aggregation.
4. **The tax-deduction report waits.** It looks tempting because of the half-stub, but it's an income-tax-prep flow — different beast from the recovery loop.

---

## Decisions locked in (2026-04-30)

1. **Debts are mostly seeded** from the credit report. M1 starts directly with "log a payment," not "enter your debts." Caveat: tax obligations and any non-credit-report debts (personal/family loans) are *not* yet in the DB and will need to be added separately.
2. **Teller is live.** M1 includes auto-linking payments to real Teller transactions from day one — no manual fallback needed.
3. **Daily usage.** Optimize for daily-friction issues (dashboard load, "what's new", quick-log buttons). M4's morning-brief framing stands; no need to design a weekly-check-in instead.

## Implications for milestone scope

- **M1 scope add:** since taxes aren't in the DB and they're debt-shaped, add a single "Add tax obligation" dialog in M1 (not the full tax page yet — just enough so the dashboard's tax card stops being aspirational). Cheap, high-honesty win.
- **M1 scope add:** a "what's changed since you last opened Bud" strip on the home page. Daily users get value from delta, not absolutes.
- **M1 stays scoped down by:** not building a full tax page (that's still M2) and not yet doing AI proactivity (still M4).

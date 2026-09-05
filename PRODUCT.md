# Product

## Register

product

## Users

A single, financially-literate individual tracking their own money flow on their own machine —
the kind of person who'd rather own a local SQLite file than hand their transactions to a SaaS.
They open the app to answer one calm question: "where did my money go this cycle?"
No team, no permissions, no cloud. Because moniflow is also a **project template**, the second
audience is the _developer_ who scaffolds a new app from it and sees this UI as their starting
point — so the design must read as a confident, finished default, not a placeholder to rip out.

## Product Purpose

A local-first, **mobile-first spending tracker**. Signed entries live in a SQLite database inside
the browser (OPFS, via SQLite WASM) — the browser is the system of record, not a server. The ledger
is overwhelmingly outflows; a POSITIVE `amount` is a **refund** — money handed back against spending
that already happened, filed under the category it refunds, so every summed figure nets. Every page
is `'use client'` and loads its own data after mount; writes go through each feature's `actions.ts`,
plain async functions rather than Server Actions. The app is scoped to a monthly **billing cycle**
(a configurable cutoff day) and organised as a phone-sized column with a bottom tab bar —
**Home · Records · ＋ · Trends · More**:

- **Home** — the cycle's total spend and (where set) its budget meter, over a by-category donut with
  the cycle's transaction count annotating the hole, plus a ranked category breakdown (chart / list
  toggle). The total sits in the panel above the ring rather than in the hole so it stays put when
  the toggle flips, and so the page's biggest figure is its most useful one. On the current cycle it
  also carries the forward view merged in from the former dashboard — safe-to-spend per day and
  upcoming recurring bills (shown even before the cycle's first expense). Irregular one-offs (a yearly
  bill, a big one-time buy) can be flagged off-budget — per entry or per category — so they stay in the
  ledger but don't distort the budget meter, pace, or safe-to-spend; Home discloses the off-budget total
  beneath the headline.
- **Records** — the cycle's expenses grouped by day, each a swipe-to-edit/delete row, with live
  cross-cycle search.
- **Trends** — the six-cycle spending trend, with a dashed line marking your own average across
  the window, a this-cycle-vs-last comparison, and a breakdown below it — **By category** or **By
  account** — that narrows to that category's own per-cycle breakdown when filtered. Anomalies stay
  category-based either way.
- **More** — a sheet of three captioned groups rather than a flat list: **Review** (Year, Month,
  Report, Trips), **Plan** (Budgets, Recurring), and **Set up** (Categories, Accounts, Currency,
  Settings, About). Budgets carries the selected cycle in its href; the rest key off windows of
  their own.
- Entries are added on a Monefy-style calculator keypad or bulk-imported from a **Monefy CSV**
  (THB home currency; non-THB rows surface in Trips).

It is a **spending tracker with refunds**: near-everything is an outflow, and the one inflow it
models is a refund against spending already recorded — the keypad has a Refund toggle, and consumers
negate a stored amount rather than taking `Math.abs`, so an expense adds and a refund subtracts.
Standalone income (salary) is deliberately unmodellable: it would drive its category net-positive
and simply drop out of the donut. Bulk Monefy CSV import still drops inflows. Success is a UI a user
fluent in Linear/Stripe/Notion would trust at a glance and a
developer would be happy to inherit and rebrand. It ships as the reference implementation for the
`create-sqlite-next-app` scaffold.

## Brand Personality

Calm, trustworthy, quietly precise. Financial-grade steadiness — generous whitespace, muted
surface, accent used sparingly for action and state, never for decoration. Numbers are rendered
plainly and honestly (losses stated, not dramatized). Three words: **steady, precise, honest.**
The voice is a competent tool that disappears into the task.

## Anti-references

- **The hero-metric SaaS dashboard template** — one giant gradient number over three supporting
  stats. The saturated dashboard cliché; explicitly banned.
- **Navy-and-gold "fintech trust"** — the second-order reflex for anything money-related. Avoid.
- **SaaS-cream / warm near-white landing** — the 2026 AI default. Light shipped as a real theme,
  but ours is a COOL near-white derived from ink on a bank statement, never a warm cream.
- **Crypto-dashboard neon overload** — glowing everything, animated tickers, urgency theatre.
  Wrong emotional register; this is calm ownership, not FOMO.
- **Identical icon-card grids** — repeated same-size cards with icon + heading + text.

## Design Principles

- **The tool disappears into the task.** Earned familiarity over novelty; standard affordances,
  consistent component vocabulary screen to screen. Delight is a moment, never a page.
- **Data honesty.** Money is rendered precisely in Plex Sans, aligned via `.tnum`
  (`font-variant-numeric: tabular-nums`) — never a mono face, which draws a slashed or dotted zero;
  gains and losses are stated plainly and never encoded in color alone (always paired with sign/icon)
  so the meaning survives color blindness and grayscale.
- **Local-first calm.** The interface reflects quiet ownership of your own data — no cloud
  anxiety, no urgency theatre, no dark patterns.
- **A strong default that gets out of the way.** As a template, the identity is opinionated but
  swappable: one accent token recolors the whole app, so a scaffolded project can make it theirs
  without a redesign.

## Accessibility & Inclusion

WCAG 2.1 AA. Body text ≥4.5:1 (the muted token is already lightened to clear AA on dark);
large/bold text ≥3:1. Full keyboard operability with a visible `:focus-visible` ring on every
interactive element. Gain/loss never conveyed by color alone — always a sign (`+`/`−`) or icon.
Every animation has a `prefers-reduced-motion: reduce` alternative (crossfade or instant). The app
follows the OS theme by default, so neither half is a second-class path: BOTH must clear contrast,
and `globals.test.ts` checks every ratio in both.

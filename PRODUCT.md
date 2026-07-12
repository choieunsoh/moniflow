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

A local-first, **mobile-first spending tracker**. Signed (always-negative) expense entries live in a
local SQLite file; Next.js Server Components read them back **directly — no API layer** — and mutations
go through Server Actions. The app is scoped to a monthly **billing cycle** (a configurable cutoff
day) and organised as a phone-sized column with a bottom tab bar:

- **Home** — the cycle's spending as a by-category donut with the total spent in the hole, plus a
  ranked category breakdown (chart / list toggle).
- **Records** — the cycle's expenses grouped by day, each a swipe-to-edit/delete row, with live
  cross-cycle search.
- **Budgets** — standing per-category monthly limits. **Categories** — add/rename/merge/delete, pick
  each category's icon + colour, and tap a category's count to jump to all its records. **Trips** —
  foreign-currency spending grouped into trips.
- Entries are added on a Monefy-style calculator keypad or bulk-imported from a **Monefy CSV**
  (THB home currency; non-THB rows surface in Trips).

It is a **spending tracker**: the ledger holds expenses only — income (inflows) is dropped on CSV
import and the keypad enters expenses, so every UI surface shows spending. Success is a UI a user
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
- **SaaS-cream / warm near-white landing** — the 2026 AI default. We're dark by identity.
- **Crypto-dashboard neon overload** — glowing everything, animated tickers, urgency theatre.
  Wrong emotional register; this is calm ownership, not FOMO.
- **Identical icon-card grids** — repeated same-size cards with icon + heading + text.

## Design Principles

- **The tool disappears into the task.** Earned familiarity over novelty; standard affordances,
  consistent component vocabulary screen to screen. Delight is a moment, never a page.
- **Data honesty.** Money is rendered precisely in mono; gains and losses are stated plainly and
  never encoded in color alone (always paired with sign/icon) so the meaning survives color
  blindness and grayscale.
- **Local-first calm.** The interface reflects quiet ownership of your own data — no cloud
  anxiety, no urgency theatre, no dark patterns.
- **A strong default that gets out of the way.** As a template, the identity is opinionated but
  swappable: one accent token recolors the whole app, so a scaffolded project can make it theirs
  without a redesign.

## Accessibility & Inclusion

WCAG 2.1 AA. Body text ≥4.5:1 (the muted token is already lightened to clear AA on dark);
large/bold text ≥3:1. Full keyboard operability with a visible `:focus-visible` ring on every
interactive element. Gain/loss never conveyed by color alone — always a sign (`+`/`−`) or icon.
Every animation has a `prefers-reduced-motion: reduce` alternative (crossfade or instant). Both
dark (default) and light themes must clear contrast.

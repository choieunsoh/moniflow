# Product

## Register

product

## Users

A single, financially-literate individual tracking their own money flow on their own machine —
the kind of person who'd rather own a local SQLite file than hand their transactions to a SaaS.
They open the app to answer one calm question: "where did my money go, and am I net up or down?"
No team, no permissions, no cloud. Because moniflow is also a **project template**, the second
audience is the _developer_ who scaffolds a new app from it and sees this UI as their starting
point — so the design must read as a confident, finished default, not a placeholder to rip out.

## Product Purpose

A local-first money-flow dashboard: ingest signed inflow/outflow entries into SQLite, and read
them back through Next.js Server Components as a net-flow summary, a flow-over-time chart, and a
recent-entries ledger. Success is a UI that a user fluent in Linear/Stripe/Notion would trust at
a glance and that a developer would be happy to inherit and rebrand. It ships as the reference
implementation for the `local-first-web-app` scaffold.

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

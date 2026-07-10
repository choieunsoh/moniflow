# Moniflow

Personal, local-first, **mobile-first spending tracker**. Signed inflow/outflow entries live in a
local SQLite file and are read back — with **no API layer** — through Next.js Server Components;
mutations go through Server Actions. Scoped to a monthly **billing cycle**, presented as a
phone-sized column with a bottom tab bar. It's a spending tracker: income is stored losslessly but
every screen shows **expenses only**. Scaffolded on the `portfolio-dashboard` stack.

## Stack

Node 24 · TypeScript 5.9 (strict, ESM) · Next.js 16 (App Router) · React 19 · Tailwind CSS v4 ·
Drizzle ORM + better-sqlite3 · ECharts 6 · Phosphor / Lucide (switchable category icon sets) ·
commander (CLI) · Vitest · ESLint 10 (flat) · Prettier 3.

## What's in it

- **Home (`/`)** — the cycle's spending as a by-category donut (total spent + transaction count in
  the hole) and a ranked category breakdown; a chart / list toggle.
- **Records (`/records`)** — the cycle's expenses grouped by day; each a swipe-to-edit/delete row;
  live cross-cycle search; tap a category marker to change its icon + colour.
- **Budgets (`/budgets`)** — standing per-category monthly limits.
- **Categories (`/categories`)** — rename / merge categories and set each one's icon and colour.
- **Trips (`/trips`)** — foreign-currency spending grouped into trips.
- **Settings (`/settings`)** — billing-cutoff day and the category icon set (emoji / Phosphor /
  Lucide).
- **Add / edit** — a Monefy-style calculator keypad (`/entries/new`) or `/entries/[id]/edit`.

Data is hand-entered or bulk-imported from a **Monefy CSV** (THB home currency; non-THB rows
surface in Trips).

## Getting started

```bash
npm install
npm run dev:web            # web app → http://127.0.0.1:4010
npm run dev -- seed        # CLI: replace the ledger with demo data
npm run dev -- import <file.csv>   # CLI: import a Monefy CSV export
npm run dev -- summary     # CLI: entry count + net money flow
npm test                   # vitest
```

The SQLite file defaults to `data/moniflow.db` (override with `MONIFLOW_DB` or `--db <path>`).
`data/` is git-ignored — never commit it.

Quality gates — before every commit, format your changes then run the checks separately so
failures surface individually:
`npm run format:files <changed files>`, then `npm run typecheck`, `npm run lint`,
`npm run format:check`, `npm test`.

See [CLAUDE.md](./CLAUDE.md) for architecture and conventions.

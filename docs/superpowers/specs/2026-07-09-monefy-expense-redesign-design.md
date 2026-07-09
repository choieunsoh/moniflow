# moniflow v2 — Monefy-style expense tracker — design

**Date:** 2026-07-09
**Branch:** `feat/monefy-expense-redesign`
**Status:** approved design → ready for implementation plan
**Supersedes:** `2026-07-09-mobile-home-bottom-bar-design.md` (v1). Reuses v1's bottom-bar chassis,
`isActivePath`, MoreSheet, `/`-as-home routing; replaces v1's Home content and removes its
desktop/responsive layer.

## Goal

Rebuild moniflow as a **mobile-only, expense-only** tracker modeled on Monefy Premium (the reference
app the user actually uses): a spending **donut** with a total-spent hero, chronological **records**,
per-category **emoji**, and a Monefy-style **calculator** entry — all driven by a single center
**expense** FAB in the sticky bottom bar.

## Principles / global constraints

- **Mobile-only.** No responsive desktop layout. The app renders as one centered column whose width
  is a single token **`--app-max-width`** (in `globals.css`). Target device: **Samsung Galaxy S24
  Ultra** (CSS viewport ~384–412px depending on the phone's screen-zoom setting). Default the token to
  `412px`; on the phone the column goes edge-to-edge regardless (screen ≤ token), and on desktop it's a
  centered fixed-width phone frame. Confirm the exact S24 Ultra CSS width on-device during the Phase-1
  smoke and set the token to match so desktop mirrors the real phone. This *removes* code: `Nav.tsx`
  and all `sm:` dual-layout branches are deleted.
- **Expense-only.** No income anywhere — no income FAB, no net/Balance duality, no inflow figures.
  The hero number is **total spent this cycle**. The signed-amount schema is UNCHANGED (safe with the
  user's ~10.7k real rows); expenses are negative amounts; the UI only ever creates/shows expenses.
- **No UI library** (unchanged decision). Emoji instead of an icon set; native `<dialog>` for sheets;
  ECharts (already installed) for the donut. Tokens + `.panel`/`.btn`/`.tap` as before.
- **Architecture unchanged:** Server Components read SQLite directly; interactivity rides URL search
  params (`?cycle=`, `?view=`); pure logic (chart builders, parser, grouping) is tested `*.test.ts`,
  components/routes are not unit-tested (verified via `build:web` + manual).

## Information architecture

- **Shell:** centered `max-w-[var(--app-max-width)]` column; sticky bottom bar always present.
  Bar slots: **Home · Records · [＋ expense FAB] · Budgets · More**.
- **More sheet** (native `<dialog>`): **Categories · Trips · Settings**.
- **Home** (`/`): the spending **chart** view — donut + total-spent hero + category legend. Keeps
  prev/next cycle nav. A small sub-toggle switches the body Chart ⇄ By-category (both are
  category-centric; the chronological log lives in Records).
- **Records** (`/records`): chronological entries **grouped by day** with a day-total header and
  notes-first rows (Monefy's by-date). Same cycle nav.
- **Budgets / Trips / Categories / Settings:** existing pages, restyled to the mobile frame; Categories
  gains emoji assignment.
- **Add expense** (`/entries/new`): calculator keypad → choose-category emoji grid.

## Phase 1 — Shell & expense focus (shippable on its own)

Every tab routes to a working page; Home still reads well before the donut lands.

- **`src/app/layout.tsx`** — wrap `<main>`'s content in a centered `max-w-[var(--app-max-width)]` column; bottom
  padding always on (no `sm:` variant); delete the desktop footer wrapper (footer moves to nothing —
  the About blurb already lives in the More sheet).
- **`src/shared/ui/AppHeader.tsx`** — drop `<Nav/>`; header becomes the wordmark + the "All accounts"-
  style cycle context (wordmark only is fine for phase 1). Constrain to the column width.
- **Delete `src/shared/ui/Nav.tsx`** and its import.
- **`src/shared/ui/BottomBar.tsx`** — remove `sm:hidden` (bar is always shown); constrain to the column
  (`left-1/2 -translate-x-1/2 w-full max-w-[var(--app-max-width)]`). Slots become **Home · Records · [＋] · Budgets ·
  More**; the center FAB is the **expense** action (label "Add expense", → `/entries/new`). New Records
  icon; keep emoji-free inline SVGs.
- **`src/app/page.tsx` (Home)** — hero = **total spent this cycle** (`฿` of `abs(outflow)`), prominent;
  keep cycle nav; keep the top-categories list (becomes the donut legend in phase 2); drop the 4-figure
  SummaryBar (net/inflow/outflow/entries) — expense-only needs only total spent + entry count.
- **`src/app/records/page.tsx` (new)** — cycle nav + the full cycle's entries newest-first, reusing the
  existing `LedgerTable`. (Upgraded to grouped-by-day + notes-first in phase 2.)
- **MoreSheet** — add a **Trips** link (now Categories · Trips · Settings).

## Phase 2 — Donut home & record views

Charts = pure tested option-builder + thin wrapper (project convention).

- **`src/features/entries/donut.ts` (new, pure, tested)** — `buildDonutOption(rows, emojiMap?)`:
  ECharts doughnut option from `Breakdown[]` (category → magnitude), center graphic = total spent.
  `donut.test.ts` asserts series data, ordering, and total.
- **`src/features/entries/DonutChart.tsx` (new, client wrapper)** — thin ECharts mount, same pattern as
  `FlowChart.tsx`.
- **`src/features/entries/by-date.ts` (new, pure, tested)** — `groupByDate(entries): { date, total,
  entries }[]` newest-day-first, each day's total = sum of magnitudes. `by-date.test.ts`.
- **Home** — render `DonutChart` with total-spent center + legend list (emoji + name + amount + %); a
  `?view=chart|category` sub-toggle (URL param) swaps donut ⇄ ranked by-category list; by-category rows
  expand to that category's entries via a native `<details>`/`<summary>` accordion (no extra param, no JS).
- **Records** — use `groupByDate`; day-total headers; rows show emoji + category + note + amount.

## Phase 3 — Category emoji (new feature slice)

- **`src/features/categories/schema.ts` (new)** — `category_meta` table: `category TEXT PRIMARY KEY,
  emoji TEXT NOT NULL`; `ensureCategoryMetaTable(db)` (`CREATE TABLE IF NOT EXISTS`); Insert/Select
  types. Registered in `drizzle.config.ts`' glob automatically.
- **`src/features/categories/queries.ts` (new, tested)** — `getEmojiMap(db): Record<string,string>`,
  `setCategoryEmoji(db, category, emoji)`. `queries.test.ts` round-trips.
- **Categories page** — list distinct categories (existing `getCategoryCounts`), each with its emoji +
  an inline picker (a small curated emoji set in a native `<dialog>`; no dependency) + existing rename.
- **Render emoji** wherever a category appears: donut legend, by-category, records, choose-category
  grid, budgets. Fallback `🏷️` when unassigned (`getEmojiMap` lookup with default).

## Phase 4 — Calculator entry

- **`src/features/entries/calc.ts` (new, pure, tested)** — `evaluate(expr: string): number | null`: a
  **safe** left-to-right evaluator for `+ − × ÷` over decimals (shunting-yard or small state machine;
  **no `eval`/`Function`**). Handles trailing operators, division-by-zero → null, empty → null.
  `calc.test.ts` covers precedence, decimals, error cases.
- **`src/features/entries/ui/Keypad.tsx` (new, client)** — Monefy-style keypad: big amount display,
  `1-9 0 . + − × ÷ =` and backspace, live-evaluates via `calc.ts`; a Note field; a "Choose category"
  button opening the emoji category grid; submit creates an **expense** (negative amount) via the
  existing entry server action.
- **`src/app/entries/new/page.tsx`** — swap the current form for the keypad flow (keep the existing
  server action / validation underneath).

## Files summary

| Phase | New | Modified | Deleted |
|---|---|---|---|
| 1 | `app/records/page.tsx` | `layout.tsx`, `AppHeader.tsx`, `BottomBar.tsx`, `page.tsx`, `MoreSheet.tsx` | `Nav.tsx` |
| 2 | `entries/donut.ts`(+test), `entries/DonutChart.tsx`, `entries/by-date.ts`(+test) | `page.tsx`, `records/page.tsx` | — |
| 3 | `features/categories/schema.ts`, `features/categories/queries.ts`(+test) | `categories/page.tsx`, donut legend / records / breakdowns | — |
| 4 | `entries/calc.ts`(+test), `entries/ui/Keypad.tsx` | `entries/new/page.tsx` | — |

## Deliberately out of scope

- Income tracking, transfers, multi-account switching (the "All accounts" bar), search — not now.
- Radial icon labels on the donut (Monefy's exact look) — a plain donut + legend is enough.
- Data migration to strip income rows — the schema is untouched; income just isn't surfaced.

## Known trade-offs / gaps

- Emoji assignment starts empty; every category shows `🏷️` until assigned. Acceptable — assign as you go.
- The calculator evaluator is left-to-right with standard precedence for `× ÷` over `+ −`; no
  parentheses (Monefy has none either).
- Desktop users get a phone-width column with dead side-space — intended per "desktop = same as mobile".

## Testing

- Pure logic (`donut.ts`, `by-date.ts`, `calc.ts`, `categories/queries.ts`) each get a colocated
  `*.test.ts`. Components/routes verified via `npm run build:web` + a mobile browser smoke (Playwright
  at 390px) at the end of each phase — the v1 round proved this catches real cascade/positioning bugs
  that build+unit tests miss.

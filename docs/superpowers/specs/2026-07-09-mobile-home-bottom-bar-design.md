# Mobile Home overview + bottom tab bar — design

**Date:** 2026-07-09
**Branch:** `feat/monefy-expense-redesign` (was `feat/mobile-home-bottom-bar`)
**Status:** ⚠️ SUPERSEDED by `2026-07-09-monefy-expense-redesign-design.md`. Implemented as the v1
foundation (bottom bar, `/`-as-home, MoreSheet, `isActivePath`); the Home *content* and the
desktop/responsive parts are replaced by the Monefy-based expense-only redesign.

## Goal

Turn Moniflow into a mobile-app-shaped experience: a single at-a-glance **Home** overview at `/`
and a **fixed bottom tab bar** (mobile only) with an oversized center "add entry" action. The user
primarily uses the app on mobile.

## Architecture decision: no UI component library

Build on the existing bespoke system — Tailwind v4 `@theme` tokens (`--color-*` oklab, `--radius-*`,
`--z-*`) + utility classes `.panel` / `.chip` / `.btn` / `.tap`. No shadcn/Radix/mobile-kit now.

- Simple overlays (the More sheet) use the **native `<dialog>` element** (`showModal()`) — focus-trap,
  `Esc`, `::backdrop`, `role="dialog"` come free from the platform.
- **Radix primitives** get adopted incrementally, styled with existing tokens, the first time a *hard*
  overlay appears (combobox, date picker, toast, nested typeahead) — not speculatively.

## Information architecture

- `/` **becomes the Home overview.** The current marketing landing is deleted; `/dashboard` is merged
  into Home and deleted (one page, one route).
- **Bottom bar (mobile only, `sm:hidden`), 5 slots:**
  `Home /` · `Budgets /budgets` · **`＋ Add`** (raised center FAB → `/entries/new`) · `Trips /trips` · `More`.
- **More** opens a **bottom sheet** (native `<dialog>`) listing: **Categories**, **Settings**, and a
  short **About** blurb.
- **Desktop (`≥sm`)** keeps the existing top `Nav`, with its `Dashboard` link removed (Home is now the
  overview). The bottom bar is hidden on desktop.

## Home page content (`/`)

Server component, `force-dynamic`, same data-access shape as the old dashboard
(`initDb` → `ensure*Table` → feature queries). Stacked mobile-first, **reusing existing components**:

1. `CycleSelector` — prev / current / next cycle (unchanged; already collapses labels to arrows on mobile).
2. `SummaryBar` — the 4 figures (net / inflow / outflow / entries).
3. `CycleProgress` — day X of the cycle.
4. **Top categories** — `Breakdown` with `getCategoryBreakdown` sliced to the top ~5 rows.
5. **Recent entries** — `LedgerTable` with the last ~5 entries of the cycle.
6. `EmptyLedger` when the cycle has no entries.

## New components

### `src/shared/ui/BottomBar.tsx` (client)
- `usePathname` for active state (mirrors `Nav`'s active logic: `/` exact, others `startsWith`).
- `fixed bottom-0 inset-x-0`, `sm:hidden`, `z-index` above content via a token, `.panel`-style surface
  with a top border and backdrop blur to match `AppHeader`.
- `padding-bottom: env(safe-area-inset-bottom)` so it clears the iOS home indicator.
- 4 flanking slots: inline-SVG icon + tiny text label, `.tap` (44px) targets; active slot tinted
  `--color-accent-soft` / `--color-accent-text`.
- Center slot: a raised ~56px circular accent button (`--color-accent` bg, overhangs the bar's top
  edge via negative margin/translate) linking to `/entries/new`. Visibly larger/primary vs the four.
- Icons are hand-written inline SVG paths (Home, Budgets, Plus, Trips, More/grid) — no icon dep.
- The `More` slot is a `<button>` that opens `MoreSheet` (not a link).

### `src/shared/ui/MoreSheet.tsx` (client)
- Native `<dialog>` controlled by a ref (`showModal()` / `close()`), styled as a bottom sheet: full
  width, pinned to the bottom, rounded top corners, slides up via a CSS transform transition; dim
  `::backdrop`.
- Content: links to `/categories`, `/settings`, and a short static About blurb.
- Closes on backdrop click, `Esc` (native), and on navigating a link.
- `BottomBar` owns the open state and renders `MoreSheet`.

## Changed / deleted files

- ✏️ `src/app/page.tsx` — rewrite as the Home overview (move the old dashboard server logic here).
- 🗑️ `src/app/dashboard/page.tsx` — delete.
- ➕ `src/shared/ui/BottomBar.tsx`
- ➕ `src/shared/ui/MoreSheet.tsx`
- ✏️ `src/app/layout.tsx` — mount `<BottomBar />`; add mobile bottom-padding to `<main>` so content
  clears the bar; hide `AppFooter` on mobile (`hidden sm:block` wrapper — it's clutter under a tab bar).
- ✏️ `src/shared/ui/Nav.tsx` — drop the `Dashboard` link (Home is the overview now).

## Deliberately cut ("leanest" scope)

The balance `FlowChart`, the account `Breakdown`, and the full 8-row `LedgerTable` are **not** rendered
on Home. Their modules (`chart.ts`, `FlowChart.tsx`, `getAccountBreakdown`) stay in the repo — still
tested, cheap to re-add — just unused. Deleting them is a separate optional cleanup.

## Known gap (accepted for now)

With the full ledger cut, an *old* entry (older than Home's recent ~5) has no browse-to-edit path.
Accepted as YAGNI; add an "All entries" view later if it bites.

## Testing

- `BottomBar` active-path detection is the only non-trivial logic. If the match helper is extracted,
  give it one small unit test; otherwise a render test asserting the active slot's `aria-current`.
- `MoreSheet` open/close is native `<dialog>` behavior — no custom logic to test beyond a render smoke
  check.
- Reused components (`SummaryBar`, `Breakdown`, `LedgerTable`, `CycleSelector`, `CycleProgress`) keep
  their existing tests.

## Non-goals

- No desktop redesign beyond dropping the Dashboard nav link.
- No new dependency.
- No changes to queries/schema (Home reuses existing reads).

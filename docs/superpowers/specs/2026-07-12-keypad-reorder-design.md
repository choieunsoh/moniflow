# Drag-to-reorder keypad grids — design

**Date:** 2026-07-12
**Branch:** `feat/keypad-reorder`
**Status:** approved, ready for implementation plan

## Summary

Let the user drag to rearrange the **category** and **account** tiles on the keypad (the
expense-entry surface). The manual order is remembered and drives *only* the two keypad grids;
every other surface is untouched. There is no separate "pin" concept — a single manual order does
the job, and "favorites first" is just "dragged to the top."

## Decisions (from brainstorming)

1. **Single manual order, no pin flag.** One `sort_order` per row; no boolean.
2. **Effect is keypad-only.** The order drives the keypad category grid and keypad account grid.
   `/categories`, `/accounts`, the home donut+breakdown, and the `/accounts` donut+breakdown all
   keep their current sort.
3. **Drag lives on the keypad grids themselves** — not on `/categories` or `/accounts`. No new UI
   on those management pages.
4. **Hand-rolled drag, no dependency.** Pointer Events + `document.elementFromPoint`, one shared
   hook. No `@dnd-kit`, no other DnD library.

## Data & persistence

- **No migration.** `sort_order` (nullable integer) already exists on both `categories` and
  `accounts` — it shipped inert as a "later slice." This feature activates it.
- **Materialize-on-drop.** On every drop, write a dense `0..n-1` to `sort_order` across the whole
  visible grid. A row never dragged (or added later) has `sort_order = null` and sorts to the
  **bottom**, tiebroken by its existing count/usage order, until the next reorder gives it a number.
- **Two new order-map reads** (mirroring `getHueMap` — return only non-null entries):
  - `getCategoryOrderMap(db): Record<string, number>` in `features/categories/queries.ts`
  - `getAccountOrderMap(db): Record<string, number>` in `features/accounts/queries.ts`
  - The existing shared reads `getCategoryCounts` and `getAccountsByUsage` are **not** changed, so
    `/categories`, `/accounts`, and the analytics keep their sort.
- **Two server actions** (`'use server'`, each ends with `revalidatePath('/', 'layout')`):
  - `reorderCategories(orderedNames: string[])` in `features/categories/actions.ts` — sets
    `sortOrder = index` per name in one transaction.
  - `reorderAccounts(orderedNames: string[])` in `features/accounts/actions.ts` — same.
  - Persist by `name` (unique). Names arrive from the client in the new visual order.

## Keypad ordering (read path)

Both `entries/new` and `entries/[id]/edit` build the keypad's `categories`/`accounts` arrays the
same way today (count/usage desc + emoji/icon/hue lookup). To avoid drift, **extract that assembly
into one shared helper** (e.g. `features/entries/keypad-lists.ts` or a query pair) used by both
pages, and apply the order there:

- Read the order map, then **stable-sort** the already-count-sorted array by
  `sortOrder ?? Number.MAX_SAFE_INTEGER`. Equal keys (both null) preserve the count/usage order as
  the tiebreak. Ordered rows float up in their chosen sequence; unordered rows trail in count order.

## `useGridReorder` hook

`src/features/entries/use-grid-reorder.ts`, generic, shared by both grids, with a `renderHook` test.

- **Long-press ~400 ms** on a tile lifts it. Before the timer fires, movement is a normal scroll and
  a quick release is a plain tap.
- On `pointermove` after activation: `document.elementFromPoint(x, y)` → read `data-reorder-index`
  of the tile underneath → splice the dragged item to that index in **local optimistic state**. The
  lifted tile carries `pointer-events: none` so `elementFromPoint` sees the tile beneath it.
- On `pointerup`: if the order changed, call the server action **and** set a `draggedRef` flag so the
  ensuing synthetic `click` is suppressed (no accidental submit/select). If nothing moved, it was a
  tap — let the click through.
- Returns `{ items, dragIndex, tileProps(index) }`. `tileProps` supplies the pointer handlers and
  `data-reorder-index`; `dragIndex` drives the lifted-tile styling.

## Keypad wiring (`features/entries/ui/Keypad.tsx`)

- The **category grid** (submit tiles) and **account grid** (select tiles) each run `useGridReorder`
  over their array. Each tile spreads `tileProps(i)` and renders `data-reorder-index={i}`; the lifted
  tile gets a small raise + opacity.
- Keypad **imports the two server actions directly** (client components may call server actions) —
  no prop threading through the page.
- **Tap still works.** The `draggedRef` guard cancels submit/select only when a real drag happened;
  a plain tap on a category tile still submits the expense, a tap on an account tile still selects it.

## Accessibility

Reordering is a touch enhancement. Tap-to-pick stays fully keyboard- and screen-reader-accessible.
Keyboard-driven reorder is **deferred** (single-user touch app) — noted, not built.

## Untouched surfaces (regression guard)

- `/categories` list — stays count desc.
- `/accounts` list — stays count desc.
- Home donut + breakdown — stays spend desc.
- `/accounts` donut + breakdown — stays spend desc.

## Testing

- `use-grid-reorder.test` (renderHook): long-press activates; `pointermove` reorders; a tap does not
  reorder and does not set the drag guard.
- `reorderCategories` / `reorderAccounts`: writes a dense `sort_order`; a fresh (untouched) row sorts
  last; persist is by name.
- Stable-sort helper: ordered rows lead in their chosen order; unordered rows trail in count order.

## Out of scope

- Pin boolean / two-tier pinned section.
- Manual order on `/categories`, `/accounts`, or any analytics surface.
- Keyboard reorder, drag auto-scroll (add only if the grid proves too tall to reach — not now).
- Archived-row UI (the `archived` column stays inert).

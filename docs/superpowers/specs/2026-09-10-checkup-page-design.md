# Checkup page — design

**Date:** 2026-09-10
**Status:** approved, ready for a plan

## Problem

`DuplicateScan` is a full surface wearing a settings row. It reads the entire ledger, renders a
list of candidate rows, and deletes them with Undo — and it does all of that inside a `<section>`
on `/settings`, between the backup buttons and the wipe-all-data control.

Two costs follow from that placement:

1. **It is hidden.** A scan of the whole ledger is not a setting. Nothing about the Settings page
   suggests a data-repair tool lives at the bottom of it.
2. **It carries a workaround that only exists because of where it sits.** Every delete ends in
   `bumpDataVersion()`, which makes `useSettings` set `ready = false`, which makes the Settings page
   render a whole-page placeholder for a beat. `DuplicateScan` unmounts and loses its `groups`
   state, so after every single delete the user landed back on a bare "Scan for duplicates" button.
   The fix was a module-scope cache (`cachedGroups`) plus a test-only reset hook. Both exist purely
   to survive a remount that the page it lives on causes.

## Scope

Move `DuplicateScan` to a route of its own. **No new checks in this round.**

An earlier draft of this idea bundled several more data-quality scans (foreign amounts recorded in
THB, categories left empty after a restore, unused accounts). Those were cut: `/categories` and
`/accounts` already list per-row counts and already have delete buttons, so two of the checks would
duplicate an existing surface. The currency check is worth doing but belongs to a different
conversation — see Out of scope.

## Naming

The route is `/checkup` and the page is titled **Checkup**, not `/duplicates`.

The page has exactly one check today, so the honest name would be Duplicates. Checkup wins anyway
because a URL is expensive to change here: moniflow is an installed PWA with a `shortcuts` entry in
its manifest, so a path the user has bookmarked or pinned breaks silently on a rename. A container
name absorbs a second check without a redirect.

The cost of the container name — a page called Checkup that checks one thing — is paid down by the
subtitle, which says plainly what is being checked.

## Design

### Route

`src/app/checkup/page.tsx` — a thin `'use client'` route in the shape of `/trips`:

- `PageContainer size="full"`
- a `<header>` with an `h1` reading **Checkup** and one muted line beneath it
- `<DuplicateScan />`

The subtitle is the copy that lives on the Settings section today, moved verbatim: rows sharing a
date, an amount and a category; three things write to the ledger and none of them checks the others.

The route holds **no hook and no `ready` gate**. Every other page in the app opens on a `…`
placeholder because its read hook is still resolving; this one has nothing to read until the user
taps Scan, so it paints complete on first frame. That is a deliberate divergence from the house
pattern, not an omission.

`DuplicateScan.tsx` stays at `src/features/entries/ui/` — the route delegates to the feature, per
the dependency rule.

### Deletions

**On `/settings`:** remove the whole `Duplicates` section — heading, description, component — and
the `DuplicateScan` import.

**In `DuplicateScan.tsx`:** remove `cachedGroups`, the `useState` seed that reads it, both writes to
it, and `__resetDuplicateScanCacheForTests`.

The cache's documented reason is the Settings remount described under Problem. On `/checkup` there
is no `useSettings`, and `AppShell` has no `ready` gate that swaps out its children — it renders the
full frame with empty defaults while its own hooks resolve. A `bumpDataVersion()` from a delete
therefore re-renders but does not unmount, and the existing in-place re-derivation inside `remove`
(filter the rows already in hand, re-group) becomes reachable for the first time.

**Behaviour this changes:** navigating away from `/checkup` and back now discards the scan result,
where the Settings section used to restore it from the module cache. Accepted — arriving at a page
named Checkup means intending to scan. Re-adding the cache is a few lines if it proves annoying.

### Navigation

Add a sixth tile to the `set-up` group in `MoreSheet`:

```
{ href: '/checkup', label: 'Checkup', Icon: Stethoscope, cycle: false }
```

`Stethoscope` comes from `lucide-react`, already a dependency. `cycle: false` — the scan reads the
whole ledger, so a `?cycle=` would be inert noise.

Six tiles fill two clean rows of the three-column grid. "Checkup" is shorter than "Categories", the
current longest label, so it clears the 12px tile-width ceiling at 412px.

`isActivePath` needs no change: `/checkup` is a prefix match like every other non-root route.

**Known wart:** the group caption is "Set up", and a data scan is not setup. The alternative,
"Review", is about spending over time (Year, Month, Report, Trips), which fits no better. "Set up"
wins on the tidy grid and on sitting next to Settings, where the feature used to live. Not worth a
fourth group for one tile.

`/settings` gets **no link** to the new page. One user, who asked for the move; two doors to one
room is not worth the copy.

## Testing

- `DuplicateScan.test.tsx` stays. Drop the `__resetDuplicateScanCacheForTests` calls. Every other
  assertion holds — the component's props, reads, and delete/Undo path are untouched.
- No test for the new route. Routes in this repo carry no tests of their own; the logic lives in
  `duplicates.ts`, which is already covered.
- Browser verification at 412px is required before this is done, per the project's workflow: the
  More sheet at six tiles, and one real scan-then-delete on `/checkup` confirming the list re-derives
  in place instead of collapsing back to the bare Scan button.

## Out of scope

- **No schema change.** No new table, no new column, so `BOOTSTRAP_SQL` and `COLUMN_MIGRATIONS` are
  untouched and the backup CSV keeps its ten columns.
- **No second check.** The page ships with one.
- **No manifest shortcut** for `/checkup`.
- **The currency problem is not addressed here.** `Keypad.tsx` starts every new entry at `THB` and
  never remembers the last currency used, so a foreign amount recorded in baht — the bug class
  behind the July 2026 yen cleanup — remains reachable today. The right fix is prevention in the
  keypad, not detection on this page. Separate spec.

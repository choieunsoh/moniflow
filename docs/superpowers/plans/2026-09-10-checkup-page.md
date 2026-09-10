# Checkup Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the duplicate scan off `/settings` onto a route of its own at `/checkup`, and delete
the module-scope cache that only existed to survive the Settings page's remount.

**Architecture:** A new thin `'use client'` route renders the existing `DuplicateScan` component
unchanged. The Settings section that used to host it is removed, and a sixth tile in the More
sheet's "Set up" group points at the new route. With `useSettings` no longer in the tree above it,
the component's `bumpDataVersion()`-triggered unmount stops happening, so `cachedGroups` and its
test-only reset hook are deleted in a second pass.

**Tech Stack:** Next.js 16 App Router (`output: 'export'`, every page `'use client'`), React 19,
Tailwind CSS v4, lucide-react, Vitest + Testing Library (jsdom).

Design spec: `docs/superpowers/specs/2026-09-10-checkup-page-design.md`

## Global Constraints

- **TypeScript bans, enforced as ESLint errors:** no `any`, no `as` casting, no `!` non-null
  assertion, no `// @ts-ignore` / `// @ts-nocheck` / `// @ts-expect-error`. Prefer `type` aliases
  over `interface`. `as const` stays allowed.
- **No new dependency.** `lucide-react` is already installed and `Stethoscope` is one of its
  exports (verified in `node_modules/lucide-react/dist/lucide-react.d.ts`).
- **No schema change.** No table, no column, so `src/db/worker.ts` (`BOOTSTRAP_SQL`) and
  `src/db/column-migrations.ts` are not touched and the backup CSV keeps its ten columns.
- **Route path is exactly `/checkup`.** The page title is `Checkup`. The More-sheet tile label is
  `Checkup` — one short word, because the 3-column tile grid at 412px fits nothing longer than the
  current longest label, `Categories`.
- **Prettier owns formatting:** single quotes, 100 columns, Tailwind class sorting. Run
  `npm run format:files <changed files>` before every commit.
- **Quality gates, run separately so failures surface individually:** `npm run typecheck`,
  `npm run lint`, `npm run format:check`, `npm test`. All must pass before committing.
- **Commit format:** `type(scope): description` with a body explaining the why. Scope is one word
  from `db`, `app`, `features`, `shared`. Do not add `Co-Authored-By:` or `Claude-Session:`
  trailers. Use repeated `-m` flags, never `-F`.
- **Branch:** work happens on `feat/checkup-page`, which already exists and already holds the spec
  commit. Do not commit to `main`.

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `src/app/checkup/page.tsx` | create | The route. Header plus `<DuplicateScan />`. No hook, no data of its own. |
| `src/app/settings/page.tsx` | modify | Loses the `Duplicates` section and its import. |
| `src/shared/ui/MoreSheet.tsx` | modify | Gains the `Stethoscope` import and a sixth `set-up` tile. |
| `src/features/entries/ui/DuplicateScan.tsx` | modify | Loses `cachedGroups` and `__resetDuplicateScanCacheForTests`. Everything else is untouched. |
| `src/features/entries/ui/DuplicateScan.test.tsx` | modify | Loses the reset call, gains a test that a fresh mount starts unscanned. |

`DuplicateScan.tsx` stays where it is. The route delegates to the feature; it does not absorb it.

## Out of scope

These are deliberate omissions, decided in the spec. Do not add them while passing through:

- **No link from `/settings` to `/checkup`.** The More-sheet tile is the only door. Two entrances
  to one room is not worth the copy for a single-user app.
- **No second check.** The page ships with duplicates and nothing else. The currency check
  discussed during brainstorming is a separate spec, because the right fix for a foreign amount
  recorded in baht is prevention in `Keypad.tsx`, not detection here.
- **No `shortcuts` entry** for `/checkup` in `src/app/manifest.ts`.
- **No change to `isActivePath`.** `/checkup` is a plain prefix match like every other non-root
  route; the helper already handles it.

---

### Task 1: The `/checkup` route, and the scan leaves Settings

**Files:**

- Create: `src/app/checkup/page.tsx`
- Modify: `src/app/settings/page.tsx` (delete lines 303-311 and the import on line 20)
- Modify: `src/shared/ui/MoreSheet.tsx` (icon import block at lines 6-18; `set-up` links array at lines 60-68)

**Interfaces:**

- Consumes: `DuplicateScan` from `@features/entries/ui/DuplicateScan` — a component taking no
  props, returning the scan button and its result list. `PageContainer` from
  `@shared/ui/PageContainer`, whose `size` prop takes `'full'` for a full-width page.
- Produces: the route `/checkup`. Task 2 relies on nothing from this task except that
  `DuplicateScan` is no longer rendered underneath `useSettings`.

**Why there is no unit test in this task:** routes in this repo carry no tests of their own, and the
logic on this page lives in `duplicates.ts`, which is already covered. A test asserting that
`settings/page.tsx` no longer imports a symbol would be a test that cannot meaningfully fail. The
gate for this task is the four quality commands plus the browser check in Step 7.

- [ ] **Step 1: Create the route**

Create `src/app/checkup/page.tsx`:

```tsx
'use client';

import { PageContainer } from '@shared/ui/PageContainer';
import { DuplicateScan } from '@features/entries/ui/DuplicateScan';

// Data-quality checks over the whole ledger, on demand. One check today; the route is named for the
// job rather than the check because an installed PWA's pinned URL is expensive to change.
//
// Unlike every other route this one holds no read hook, and therefore no `…` placeholder: nothing is
// read until the scan button is pressed, so the page paints complete on its first frame.
export default function CheckupPage() {
  return (
    <PageContainer size="full">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Checkup</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Rows sharing a date, an amount and a category. Three things write to the ledger and none of
          them checks the others.
        </p>
      </header>
      <DuplicateScan />
    </PageContainer>
  );
}
```

- [ ] **Step 2: Remove the section from Settings**

In `src/app/settings/page.tsx`, delete this import (currently line 20):

```tsx
import { DuplicateScan } from '@features/entries/ui/DuplicateScan';
```

and delete this whole block (currently lines 304-311, plus the blank line 303 that preceded it), so
that the backup `</section>` on line 302 is followed directly by the blank line and then the
`<section` that opens the wipe-all-data panel:

```tsx
      <section className="panel flex flex-col gap-3 p-5">
        <h2 className="text-sm font-semibold">Duplicates</h2>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Rows sharing a date, an amount and a category. Three things write to the ledger and none
          of them checks the others.
        </p>
        <DuplicateScan />
      </section>
```

- [ ] **Step 3: Add the More-sheet tile**

In `src/shared/ui/MoreSheet.tsx`, add `Stethoscope` to the `lucide-react` import list (the block
currently spanning lines 6-18), keeping the list's existing order convention by appending it last:

```tsx
import {
  Tags,
  Wallet,
  Plane,
  Repeat,
  Settings,
  Target,
  CalendarRange,
  CalendarClock,
  PieChart,
  Info,
  Coins,
  Stethoscope,
} from 'lucide-react';
```

Then append one entry to the `set-up` group's `links` array, after the `/about` line:

```tsx
      { href: '/about', label: 'About', Icon: Info, cycle: false },
      // cycle: false — the scan reads the WHOLE ledger, not a cycle, so a ?cycle= riding along
      // would be inert noise in the URL. Six tiles fill two clean rows of the three-column grid.
      { href: '/checkup', label: 'Checkup', Icon: Stethoscope, cycle: false },
```

- [ ] **Step 4: Format the files you touched**

Run:

```bash
npm run format:files src/app/checkup/page.tsx src/app/settings/page.tsx src/shared/ui/MoreSheet.tsx
```

Expected: `ok` — either "no changes needed" or a list of the files it rewrote.

- [ ] **Step 5: Run the gates separately**

Run each and confirm each passes before moving to the next:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
```

Expected: `typecheck` silent, `lint` silent, `format:check` clean, `npm test` all files passing with
no change in the failure count from before this task (the suite is ~115 `*.test.ts` plus ~29
`*.test.tsx`). `DuplicateScan.test.tsx` still passes untouched — the component did not change.

If `lint` complains that `Stethoscope` is unused, the tile entry in Step 3 was not added.

- [ ] **Step 6: Commit**

```bash
git add src/app/checkup/page.tsx src/app/settings/page.tsx src/shared/ui/MoreSheet.tsx
git commit -m "feat(app): give the duplicate scan its own page" -m "The scan reads the entire ledger and deletes rows with Undo, which is a surface, not a setting. Buried at the bottom of /settings it was both hard to find and hard to leave running: every delete bumps the data version, useSettings drops to ready=false, and the whole page becomes a placeholder for a beat." -m "It now lives at /checkup, reachable from a sixth Set up tile in the More sheet. Named for the job rather than the one check it runs, because an installed PWA's pinned URL is expensive to change later."
```

- [ ] **Step 7: Verify in a browser at 412px**

Start the dev server with `npm run dev:web` and open `http://127.0.0.1:4010` at a 412px viewport.

Confirm all four:

1. The More sheet's "Set up" group shows six tiles in two rows of three, with `Checkup` and its
   stethoscope glyph last. No label wraps or truncates.
2. Tapping `Checkup` lands on `/checkup`, which paints its heading and subtitle immediately with no
   `…` placeholder beat.
3. `Scan for duplicates` returns the same list the Settings section used to return. The dev ledger
   is real data — do not delete a row you did not create yourself.
4. `/settings` no longer shows a Duplicates section, and the backup panel now sits directly above
   the wipe-all-data panel with no gap where the removed section was.

---

### Task 2: Delete the module cache

**Files:**

- Modify: `src/features/entries/ui/DuplicateScan.tsx` (lines 27-46 comment and cache, line 54 `useState` seed, line 70 and line 98 writes)
- Test: `src/features/entries/ui/DuplicateScan.test.tsx` (import on line 16, `beforeEach` on lines 44-53)

**Interfaces:**

- Consumes: the `/checkup` route from Task 1. The cache must not be removed before the component
  leaves `/settings`, or every delete sends the user back to a bare Scan button.
- Produces: `DuplicateScan` exported as the module's only export. The named export
  `__resetDuplicateScanCacheForTests(): void` no longer exists — nothing outside the test file ever
  imported it.

- [ ] **Step 1: Write the failing test**

In `src/features/entries/ui/DuplicateScan.test.tsx`, add this test immediately after the existing
`'reads nothing until the scan button is pressed'` test:

```tsx
  it('starts unscanned on a fresh mount', async () => {
    // Two rows sharing date+amount+category, so a scan produces one group with two Delete buttons.
    getEntries.mockResolvedValue([row({ id: 1, account: 'Cash' }), row({ id: 2, account: 'Card' })]);

    const first = render(<DuplicateScan />);
    clickScan();
    expect(await screen.findAllByRole('button', { name: /Delete Coffee/ })).toHaveLength(2);
    first.unmount();

    // A second mount is a fresh visit to /checkup. It must show the button, not a result carried
    // over in module scope from the last visit — the ledger may have changed in between.
    render(<DuplicateScan />);
    expect(screen.getByRole('button', { name: 'Scan for duplicates' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete Coffee/ })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- src/features/entries/ui/DuplicateScan.test.tsx
```

Expected: FAIL on `starts unscanned on a fresh mount`. The second `render` seeds its `useState` from
the module-scope `cachedGroups`, so the two `Delete Coffee` buttons are still in the document and
`queryByRole` finds one where the assertion expects null.

If it PASSES, the cache is already gone and this task is a no-op — stop and re-read the file.

- [ ] **Step 3: Delete the cache from the component**

In `src/features/entries/ui/DuplicateScan.tsx`, delete the comment block and declaration currently
at lines 27-40:

```tsx
// Module-scope, not component state: deleting a row runs through deleteEntryAction, which ends in
// bumpDataVersion(). That bumps useSettings, which sets ready=false while it re-reads, and the
// Settings page renders a whole-page placeholder for that beat — DuplicateScan unmounts and its
// `groups` state is gone, so the very re-derivation `remove` does below (cheap: filter + re-group
// the rows already in hand, no second getEntries) was unreachable in production; the user just
// landed back on the bare "Scan for duplicates" button after every single delete. Seeding useState
// from this module-level cache survives that remount.
//
// ponytail: this is a cache with no invalidation — it goes stale if the ledger changes some OTHER
// way while it sits here (an edit, an import, another tab). The Scan button is the only way to force
// a fresh read; that ceiling is accepted because a stale duplicate LIST is harmless (worst case you
// see a pair that's no longer a dupe, or miss one that's now a dupe — Delete itself still operates
// on live ids either way) and the alternative is re-reading 10k+ rows after every remount.
let cachedGroups: EntryRow[][] | null = null;
```

Delete the comment block and function currently at lines 42-47:

```tsx
// Test-only: the module cache above is process-lifetime, so without a reset one test's scan leaks
// into the next test's initial render. Not exported for anything else — production never needs to
// clear it.
export function __resetDuplicateScanCacheForTests(): void {
  cachedGroups = null;
}
```

Change the `useState` seed on line 54 from `cachedGroups` to `null`:

```tsx
  const [groups, setGroups] = useState<EntryRow[][] | null>(null);
```

In `scan()`, delete the `cachedGroups = next;` write so the body reads:

```tsx
    void withDb(async (db) => {
      const rows = await getEntries(db);
      setGroups(findDuplicateGroups(rows));
    }).finally(() => setScanning(false));
```

In `remove()`, delete the `cachedGroups = next;` write inside the `setGroups` updater so it reads:

```tsx
      setGroups((current) => {
        if (current === null) return current;
        const remaining = current.flat().filter((row) => row.id !== entry.id);
        return findDuplicateGroups(remaining);
      });
```

Keep the `import type { EntryRow } from '../schema';` line — `EntryRow` is still used by
`rowDeleteLabel`, `remove`, and the `useState` type parameter.

- [ ] **Step 4: Update the comment on the `remove` re-derivation**

The comment above `remove()` says the in-place re-derivation is "what a second read would produce".
That is still true and stays. But the comment above the component (currently lines 49-53) explains
the three states of `groups`; leave it as is. Instead, add one line to the top of `remove()`'s
existing comment block so the next reader knows why the in-place update is now load-bearing rather
than dead code:

```tsx
  // Delete, then offer the same Undo the Records swipe does (deleteEntryAction/undoDeleteEntry are
  // the same pairing, same snapshot). Re-run the scan over the rows already on screen minus the
  // deleted id rather than re-reading the whole ledger — every other row's group membership is
  // unaffected by one deletion, so this is exactly what a second read would produce. This path was
  // unreachable while the component lived on /settings, whose ready gate unmounted it on every
  // delete; on /checkup nothing above it un-mounts, so this is the update the user actually sees.
```

- [ ] **Step 5: Remove the reset hook from the test**

In `src/features/entries/ui/DuplicateScan.test.tsx`, change the import on line 16 from:

```tsx
import { DuplicateScan, __resetDuplicateScanCacheForTests } from './DuplicateScan';
```

to:

```tsx
import { DuplicateScan } from './DuplicateScan';
```

and delete these three lines from the `beforeEach`:

```tsx
    // The scan cache is module-scope (that's the point of the fix — it survives the remount a
    // delete triggers), so it survives across tests too unless cleared here.
    __resetDuplicateScanCacheForTests();
```

- [ ] **Step 6: Run the test to verify it passes**

Run:

```bash
npm test -- src/features/entries/ui/DuplicateScan.test.tsx
```

Expected: PASS, every test in the file including the new `starts unscanned on a fresh mount`.

- [ ] **Step 7: Format the files you touched**

Run:

```bash
npm run format:files src/features/entries/ui/DuplicateScan.tsx src/features/entries/ui/DuplicateScan.test.tsx
```

Expected: `ok`.

- [ ] **Step 8: Run the gates separately**

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
```

Expected: all four pass. Watch `lint` in particular — if `EntryRow` was removed from the import by
mistake, `typecheck` fails first; if it was left in but is genuinely unused, `lint` flags it.

- [ ] **Step 9: Commit**

```bash
git add src/features/entries/ui/DuplicateScan.tsx src/features/entries/ui/DuplicateScan.test.tsx
git commit -m "refactor(features): drop the duplicate scan's module cache" -m "cachedGroups and its test-only reset hook existed for exactly one reason: on /settings, every delete bumped the data version, useSettings dropped to ready=false, and the page's placeholder unmounted the scan along with its results. Seeding useState from module scope survived that remount." -m "On /checkup nothing above the component un-mounts it, so the reason is gone and a cache with no invalidation is not worth keeping. The in-place re-derivation inside remove() becomes the update the user actually sees, and a new test pins the behaviour this changes: a fresh mount starts unscanned instead of restoring the last visit's list."
```

- [ ] **Step 10: Verify in a browser at 412px**

With `npm run dev:web` running, open `/checkup` at 412px and confirm both:

1. Scanning, then deleting one row of a pair, leaves the list on screen with that row gone and an
   `Undo` toast. It must not collapse back to the bare `Scan for duplicates` button — that
   collapse is the bug this whole plan removes. Use a ฿1 row you created yourself; the dev ledger
   is real data.
2. Navigating to another tab and back to `/checkup` shows the bare `Scan for duplicates` button.
   That is the intended behaviour change, not a regression.

---

## Done

Both tasks committed on `feat/checkup-page`, all four gates green, and both browser checks passed.
The branch is ready for the `superpowers:finishing-a-development-branch` skill to merge it.

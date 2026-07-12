# Drag-to-reorder Keypad Grids — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user long-press-drag to rearrange the category and account tiles on the expense keypad; the manual order is remembered and drives only those two grids.

**Architecture:** Activate the already-existing inert `sort_order` column on `categories`/`accounts`. Two thin reads expose the order, two query fns persist it (wrapped by `'use server'` actions), a shared assembler orders the keypad lists, and one hand-rolled Pointer-Events hook (`useGridReorder`, no dependency) drives the drag via `document.elementFromPoint`. Nothing else in the app changes behaviour.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript 5.9 strict · drizzle-orm + better-sqlite3 · Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-07-12-keypad-reorder-design.md`

**Conventions (from CLAUDE.md):**
- No `any` / `as` / `!` / ts-comments; `type` over `interface`; `for..of` over `forEach`.
- Before each commit: `npm run format:files <changed files>` → `npm run typecheck` → `npm run lint` → `npm test`. All must pass.
- Commit with repeated `-m` flags (never `-F`). Scope is one of `db|app|cli|features|shared`.
- Run shell in Git Bash (POSIX).

---

## File map

- **Modify** `src/features/categories/queries.ts` — add `getCategoryOrderMap`, `setCategoryOrder`.
- **Modify** `src/features/categories/queries.test.ts` — tests for the two fns.
- **Modify** `src/features/categories/actions.ts` — add `reorderCategories` (thin `'use server'` wrapper).
- **Modify** `src/features/accounts/queries.ts` — add `getAccountOrderMap`, `setAccountOrder`.
- **Modify** `src/features/accounts/queries.test.ts` — tests for the two fns.
- **Modify** `src/features/accounts/actions.ts` — add `reorderAccounts`.
- **Create** `src/features/entries/keypad-lists.ts` — `sortByManualOrder`, `getKeypadCategories`, `getKeypadAccounts`.
- **Create** `src/features/entries/keypad-lists.test.ts` — tests.
- **Modify** `src/app/entries/new/page.tsx` — use the assembler.
- **Modify** `src/app/entries/[id]/edit/page.tsx` — use the assembler.
- **Create** `src/features/entries/use-grid-reorder.ts` — `moveItem`, `useGridReorder`.
- **Create** `src/features/entries/use-grid-reorder.test.ts` — tests.
- **Modify** `src/features/entries/ui/Keypad.tsx` — wire both grids.

---

## Task 1: Categories data layer — order map + persist

**Files:**
- Modify: `src/features/categories/queries.ts`
- Modify: `src/features/categories/queries.test.ts`
- Modify: `src/features/categories/actions.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/features/categories/queries.test.ts` (add `getCategoryOrderMap`, `setCategoryOrder`, and `addCategory` — if already imported, don't duplicate — to the import block from `./queries`):

```ts
describe('setCategoryOrder / getCategoryOrderMap', () => {
  it('writes a dense sort_order in the given order and reads it back', () => {
    const d = db();
    addCategory(d, 'Food');
    addCategory(d, 'Coffee');
    addCategory(d, 'Games');
    setCategoryOrder(d, ['Coffee', 'Games', 'Food']);
    expect(getCategoryOrderMap(d)).toEqual({ Coffee: 0, Games: 1, Food: 2 });
  });

  it('leaves an untouched category out of the map (null sort_order)', () => {
    const d = db();
    addCategory(d, 'Food');
    addCategory(d, 'Coffee');
    setCategoryOrder(d, ['Coffee']); // Food never ordered
    const map = getCategoryOrderMap(d);
    expect(map).toEqual({ Coffee: 0 });
    expect('Food' in map).toBe(false);
  });

  it('re-orders densely on a subsequent call', () => {
    const d = db();
    addCategory(d, 'Food');
    addCategory(d, 'Coffee');
    setCategoryOrder(d, ['Food', 'Coffee']);
    setCategoryOrder(d, ['Coffee', 'Food']);
    expect(getCategoryOrderMap(d)).toEqual({ Coffee: 0, Food: 1 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/features/categories/queries.test.ts`
Expected: FAIL — `setCategoryOrder is not a function` / `getCategoryOrderMap is not a function`.

- [ ] **Step 3: Implement the two query fns**

Append to `src/features/categories/queries.ts` (module already imports `eq` from `drizzle-orm`, `Db`, and `categories`):

```ts
// Only categories with a manual sort_order land in the map; unordered ones are absent (caller sorts
// them last). Mirrors getHueMap.
export function getCategoryOrderMap(db: Db): Record<string, number> {
  const rows = db
    .select({ name: categories.name, sortOrder: categories.sortOrder })
    .from(categories)
    .all();
  const map: Record<string, number> = {};
  for (const row of rows) if (row.sortOrder !== null) map[row.name] = row.sortOrder;
  return map;
}

// Persist a manual order: write a dense 0..n-1 to sort_order across the named categories, in one
// transaction. Names not present are no-ops (UPDATE ... WHERE name). Materialises the whole visible
// grid on every drop, so there is never a mix of ordered and half-ordered rows the user dragged.
export function setCategoryOrder(db: Db, orderedNames: string[]): void {
  db.transaction((tx) => {
    for (const [i, name] of orderedNames.entries()) {
      tx.update(categories).set({ sortOrder: i }).where(eq(categories.name, name)).run();
    }
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/features/categories/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the `'use server'` action (thin wrapper — logic already tested above)**

Append to `src/features/categories/actions.ts` and add `setCategoryOrder` to the existing import from `./queries`:

```ts
// Persist the keypad's manual category order. Typed args (not FormData) — the client posts the new
// order as a string[]. Revalidates so the reordered grid is what the next render serves.
export async function reorderCategories(orderedNames: string[]): Promise<void> {
  const db = initDb();
  ensureCategoriesTable(db);
  setCategoryOrder(db, orderedNames);
  revalidatePath('/', 'layout');
}
```

- [ ] **Step 6: Quality gates**

Run: `npm run format:files src/features/categories/queries.ts src/features/categories/queries.test.ts src/features/categories/actions.ts && npm run typecheck && npm run lint && npm test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/categories/queries.ts src/features/categories/queries.test.ts src/features/categories/actions.ts
git commit -m "feat(features): persist and read a manual category order" -m "Activate the inert categories.sort_order: setCategoryOrder writes a dense 0..n-1, getCategoryOrderMap reads it (unordered rows absent), reorderCategories wraps the write as a Server Action. Feeds the keypad drag-reorder." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01Nd89nCpyxLn93xrssoVHE8"
```

---

## Task 2: Accounts data layer — order map + persist

**Files:**
- Modify: `src/features/accounts/queries.ts`
- Modify: `src/features/accounts/queries.test.ts`
- Modify: `src/features/accounts/actions.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/features/accounts/queries.test.ts` (ensure `addAccount`, `setAccountOrder`, `getAccountOrderMap` are imported from `./queries`; the file already has an in-memory `db()` helper that calls `ensureAccountsTable` — reuse it):

```ts
describe('setAccountOrder / getAccountOrderMap', () => {
  it('writes a dense sort_order in the given order and reads it back', () => {
    const d = db();
    addAccount(d, 'Cash');
    addAccount(d, 'Card');
    addAccount(d, 'QR');
    setAccountOrder(d, ['QR', 'Cash', 'Card']);
    expect(getAccountOrderMap(d)).toEqual({ QR: 0, Cash: 1, Card: 2 });
  });

  it('leaves an untouched account out of the map', () => {
    const d = db();
    addAccount(d, 'Cash');
    addAccount(d, 'Card');
    setAccountOrder(d, ['Card']);
    const map = getAccountOrderMap(d);
    expect(map).toEqual({ Card: 0 });
    expect('Cash' in map).toBe(false);
  });
});
```

> If `src/features/accounts/queries.test.ts` has no `db()` helper yet, add this at the top after the imports:
> ```ts
> function db() {
>   const d = initDb(':memory:');
>   ensureAccountsTable(d);
>   return d;
> }
> ```
> importing `initDb` from `@db/client` and `ensureAccountsTable` from `./schema`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/features/accounts/queries.test.ts`
Expected: FAIL — `setAccountOrder is not a function`.

- [ ] **Step 3: Implement the two query fns**

Append to `src/features/accounts/queries.ts` (module already imports `eq`, `Db`, `accounts`):

```ts
// Only accounts with a manual sort_order land in the map; unordered ones are absent (caller sorts
// them last). Mirrors getAccountHueMap.
export function getAccountOrderMap(db: Db): Record<string, number> {
  const rows = db
    .select({ name: accounts.name, sortOrder: accounts.sortOrder })
    .from(accounts)
    .all();
  const map: Record<string, number> = {};
  for (const row of rows) if (row.sortOrder !== null) map[row.name] = row.sortOrder;
  return map;
}

// Persist a manual order: dense 0..n-1 across the named accounts, one transaction. Names not present
// are no-ops. Materialises the whole visible grid on every drop.
export function setAccountOrder(db: Db, orderedNames: string[]): void {
  db.transaction((tx) => {
    for (const [i, name] of orderedNames.entries()) {
      tx.update(accounts).set({ sortOrder: i }).where(eq(accounts.name, name)).run();
    }
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/features/accounts/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the `'use server'` action**

Append to `src/features/accounts/actions.ts` and add `setAccountOrder` to the existing import from `./queries`:

```ts
// Persist the keypad's manual account order. Typed args — the client posts the new order as string[].
export async function reorderAccounts(orderedNames: string[]): Promise<void> {
  const db = initDb();
  ensureAccountsTable(db);
  setAccountOrder(db, orderedNames);
  revalidatePath('/', 'layout');
}
```

- [ ] **Step 6: Quality gates**

Run: `npm run format:files src/features/accounts/queries.ts src/features/accounts/queries.test.ts src/features/accounts/actions.ts && npm run typecheck && npm run lint && npm test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/accounts/queries.ts src/features/accounts/queries.test.ts src/features/accounts/actions.ts
git commit -m "feat(features): persist and read a manual account order" -m "Mirror of the category order layer: setAccountOrder writes a dense 0..n-1, getAccountOrderMap reads it, reorderAccounts wraps the write as a Server Action." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01Nd89nCpyxLn93xrssoVHE8"
```

---

## Task 3: Keypad list assembler — order-aware, shared by both pages

**Files:**
- Create: `src/features/entries/keypad-lists.ts`
- Create: `src/features/entries/keypad-lists.test.ts`
- Modify: `src/app/entries/new/page.tsx`
- Modify: `src/app/entries/[id]/edit/page.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/entries/keypad-lists.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { initDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { ensureCategoriesTable } from '@features/categories/schema';
import { addCategory, setCategoryOrder } from '@features/categories/queries';
import { sortByManualOrder, getKeypadCategories } from './keypad-lists';

describe('sortByManualOrder', () => {
  it('floats ordered items to the front in their chosen sequence', () => {
    const items = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
    expect(sortByManualOrder(items, { C: 0, A: 1 }).map((x) => x.name)).toEqual(['C', 'A', 'B']);
  });

  it('keeps unordered items in their incoming order, after the ordered ones', () => {
    const items = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
    expect(sortByManualOrder(items, { B: 0 }).map((x) => x.name)).toEqual(['B', 'A', 'C']);
  });

  it('is identity when the order map is empty', () => {
    const items = [{ name: 'A' }, { name: 'B' }];
    expect(sortByManualOrder(items, {}).map((x) => x.name)).toEqual(['A', 'B']);
  });
});

describe('getKeypadCategories', () => {
  it('returns tiles in the persisted manual order', () => {
    const d = initDb(':memory:');
    ensureEntriesTable(d);
    ensureCategoriesTable(d);
    addCategory(d, 'Food');
    addCategory(d, 'Coffee');
    setCategoryOrder(d, ['Coffee', 'Food']);
    expect(getKeypadCategories(d).map((c) => c.name)).toEqual(['Coffee', 'Food']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/features/entries/keypad-lists.test.ts`
Expected: FAIL — cannot find module `./keypad-lists`.

- [ ] **Step 3: Implement the assembler**

Create `src/features/entries/keypad-lists.ts`:

```ts
import type { Db } from '@db/client';
import { getCategoryCounts, getAccountsByUsage } from './queries';
import {
  getEmojiMap,
  emojiFor,
  getHueMap,
  hueFor,
  getCategoryOrderMap,
} from '@features/categories/queries';
import {
  getAccountIconMap,
  iconForAccount,
  getAccountHueMap,
  hueForAccount,
  getAccountOrderMap,
} from '@features/accounts/queries';
import type { KeypadCategory, KeypadAccount } from './ui/Keypad';

// Float manually-ordered rows to the front in their chosen sequence; the rest keep their incoming
// (count / usage) order. Stable — Array.prototype.sort preserves the order of equal keys (ES2019+),
// so unset rows (sort key MAX) stay in their original relative order. Pure.
export function sortByManualOrder<T extends { name: string }>(
  items: T[],
  order: Record<string, number>,
): T[] {
  const MAX = Number.MAX_SAFE_INTEGER;
  return [...items].sort((a, b) => (order[a.name] ?? MAX) - (order[b.name] ?? MAX));
}

// The keypad's category tiles: count-desc from getCategoryCounts, re-floated by the manual order.
// Shared by the new-entry and edit routes so their grids can't drift.
export function getKeypadCategories(db: Db): KeypadCategory[] {
  const emojiMap = getEmojiMap(db);
  const hueMap = getHueMap(db);
  const list = getCategoryCounts(db).map((c) => ({
    name: c.category,
    emoji: emojiFor(emojiMap, c.category),
    hue: hueFor(hueMap, c.category),
  }));
  return sortByManualOrder(list, getCategoryOrderMap(db));
}

// The keypad's account tiles: usage-desc from getAccountsByUsage, re-floated by the manual order.
export function getKeypadAccounts(db: Db): KeypadAccount[] {
  const iconMap = getAccountIconMap(db);
  const hueMap = getAccountHueMap(db);
  const list = getAccountsByUsage(db).map((name) => ({
    name,
    icon: iconForAccount(iconMap, name),
    hue: hueForAccount(hueMap, name),
  }));
  return sortByManualOrder(list, getAccountOrderMap(db));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/features/entries/keypad-lists.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire `new/page.tsx` to the assembler**

In `src/app/entries/new/page.tsx`:

Replace the import line
```ts
import { getAccountsByUsage, getLatestAccount, getCategoryCounts } from '@features/entries/queries';
```
with
```ts
import { getLatestAccount } from '@features/entries/queries';
import { getKeypadCategories, getKeypadAccounts } from '@features/entries/keypad-lists';
```

Remove the now-unused category/account map imports:
```ts
import { getEmojiMap, emojiFor, getHueMap, hueFor } from '@features/categories/queries';
import {
  getAccountIconMap,
  iconForAccount,
  getAccountHueMap,
  hueForAccount,
} from '@features/accounts/queries';
```
(Delete both blocks. Keep the `ensureCategoriesTable` / `ensureAccountsTable` schema imports.)

Replace the assembly block
```ts
  const emojiMap = getEmojiMap(db);
  const hueMap = getHueMap(db);
  const iconSet = getIconSet(db);
  // Most-used categories first, so the common ones are at the top of the picker grid.
  const categories = getCategoryCounts(db).map((c) => ({
    name: c.category,
    emoji: emojiFor(emojiMap, c.category),
    hue: hueFor(hueMap, c.category),
  }));
  // Most-used accounts first for the picker grid, each with its brand glyph + hue (same shape as the
  // category tiles). Default to the account last used so the common case (same account again) is zero
  // taps.
  const accountIconMap = getAccountIconMap(db);
  const accountHueMap = getAccountHueMap(db);
  const accounts = getAccountsByUsage(db).map((name) => ({
    name,
    icon: iconForAccount(accountIconMap, name),
    hue: hueForAccount(accountHueMap, name),
  }));
  const latestAccount = getLatestAccount(db) ?? accounts[0]?.name ?? '';
```
with
```ts
  const iconSet = getIconSet(db);
  // Tiles in the user's manual keypad order (count/usage order for anything not yet dragged).
  const categories = getKeypadCategories(db);
  const accounts = getKeypadAccounts(db);
  // Default to the account last used so the common case (same account again) is zero taps.
  const latestAccount = getLatestAccount(db) ?? accounts[0]?.name ?? '';
```

- [ ] **Step 6: Wire `[id]/edit/page.tsx` to the assembler**

In `src/app/entries/[id]/edit/page.tsx`, apply the same substitution inside the `keypadEditable` branch. Replace `getCategoryCounts`/`getAccountsByUsage` usage and the emoji/icon/hue map lookups (lines assembling `categories` and `accounts`) with:
```ts
    const iconSet = getIconSet(db);
    const categories = getKeypadCategories(db);
    const accounts = getKeypadAccounts(db);
```
Update imports: add
```ts
import { getKeypadCategories, getKeypadAccounts } from '@features/entries/keypad-lists';
```
and remove `getCategoryCounts`, `getAccountsByUsage` from the `@features/entries/queries` import (keep the others it uses, e.g. `getDistinctAccounts`, `getDistinctCategories`), and remove the now-unused `getEmojiMap, emojiFor, getHueMap, hueFor` and `getAccountIconMap, iconForAccount, getAccountHueMap, hueForAccount` imports **only if** the non-keypad branch below no longer references them. (Check: the fallback `EntryForm` branch uses `getDistinctAccounts`/`getDistinctCategories`, not these maps — so they can be removed.)

- [ ] **Step 7: Quality gates**

Run: `npm run format:files src/features/entries/keypad-lists.ts src/features/entries/keypad-lists.test.ts src/app/entries/new/page.tsx "src/app/entries/[id]/edit/page.tsx" && npm run typecheck && npm run lint && npm test`
Expected: all PASS. (Typecheck confirms no dangling imports.)

- [ ] **Step 8: Commit**

```bash
git add src/features/entries/keypad-lists.ts src/features/entries/keypad-lists.test.ts src/app/entries/new/page.tsx "src/app/entries/[id]/edit/page.tsx"
git commit -m "feat(features): order keypad tiles by the manual sort_order" -m "Extract the duplicated keypad category/account assembly into keypad-lists.ts and re-float each list by its manual order (unordered rows keep count/usage order). Both the new-entry and edit routes now share it, so their grids can't drift." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01Nd89nCpyxLn93xrssoVHE8"
```

---

## Task 4: `useGridReorder` hook + `moveItem`

**Files:**
- Create: `src/features/entries/use-grid-reorder.ts`
- Create: `src/features/entries/use-grid-reorder.test.ts`

- [ ] **Step 1: Write the failing test for `moveItem`**

Create `src/features/entries/use-grid-reorder.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { moveItem, useGridReorder } from './use-grid-reorder';

describe('moveItem', () => {
  it('moves an item forward', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });
  it('moves an item backward', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });
  it('returns the same array reference for a no-op move', () => {
    const arr = ['a', 'b'];
    expect(moveItem(arr, 0, 0)).toBe(arr);
    expect(moveItem(arr, 5, 0)).toBe(arr);
  });
});
```

- [ ] **Step 2: Write the failing hook tests (same file)**

Append to `src/features/entries/use-grid-reorder.test.ts`:

```ts
// The pressed tile only needs pointer-capture methods (the hook's DragPointer.currentTarget type).
function captureTarget() {
  return { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() };
}
// A real DOM button so document.elementFromPoint can be mocked to return it — jsdom's closest() and
// getAttribute() then resolve the tile index for real, no cast needed.
function tileEl(index: number) {
  const el = document.createElement('button');
  el.setAttribute('data-reorder-index', String(index));
  return el;
}

describe('useGridReorder', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const items = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];

  it('a quick tap does not activate a drag and does not suppress the click', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useGridReorder(items, onReorder));
    const p = { pointerId: 1, clientX: 10, clientY: 10, currentTarget: captureTarget() };
    act(() => result.current.tileProps(0).onPointerDown(p));
    act(() => result.current.tileProps(0).onPointerUp(p));
    expect(result.current.dragIndex).toBeNull();
    expect(result.current.consumeDragClick()).toBe(false);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('a long press activates the drag (tile lifts)', () => {
    const { result } = renderHook(() => useGridReorder(items, vi.fn()));
    const p = { pointerId: 1, clientX: 10, clientY: 10, currentTarget: captureTarget() };
    act(() => result.current.tileProps(0).onPointerDown(p));
    act(() => vi.advanceTimersByTime(400));
    expect(result.current.dragIndex).toBe(0);
  });

  it('dragging over another tile reorders and persists on drop, suppressing the click once', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useGridReorder(items, onReorder));

    const down = { pointerId: 1, clientX: 10, clientY: 10, currentTarget: captureTarget() };
    act(() => result.current.tileProps(0).onPointerDown(down));
    act(() => vi.advanceTimersByTime(400)); // activate

    // Finger now over tile index 2.
    const spy = vi.spyOn(document, 'elementFromPoint').mockReturnValue(tileEl(2));
    const move = { pointerId: 1, clientX: 210, clientY: 10, currentTarget: captureTarget() };
    act(() => result.current.tileProps(0).onPointerMove(move));
    expect(result.current.items.map((x) => x.name)).toEqual(['B', 'C', 'A']);

    const up = { pointerId: 1, clientX: 210, clientY: 10, currentTarget: captureTarget() };
    act(() => result.current.tileProps(0).onPointerUp(up));
    expect(onReorder).toHaveBeenCalledExactlyOnceWith([{ name: 'B' }, { name: 'C' }, { name: 'A' }]);
    expect(result.current.consumeDragClick()).toBe(true); // eats the synthetic click
    expect(result.current.consumeDragClick()).toBe(false); // and only once
    spy.mockRestore();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- src/features/entries/use-grid-reorder.test.ts`
Expected: FAIL — cannot find module `./use-grid-reorder`.

- [ ] **Step 4: Implement the hook**

Create `src/features/entries/use-grid-reorder.ts`:

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const LONG_PRESS_MS = 400;
const CANCEL_DIST = 10; // px of pre-activation movement that means "scroll/tap", not "drag"

// Move arr[from] to index `to`, returning a new array (or the same reference for a no-op). Pure.
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const next = arr.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// The tile index under a screen point, or null. The lifted tile carries pointer-events:none so this
// sees the tile beneath it; closest() climbs from the icon/label child to the tile button.
function indexAtPoint(x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y);
  const tile = el?.closest('[data-reorder-index]');
  const raw = tile?.getAttribute('data-reorder-index');
  return raw === null || raw === undefined ? null : Number(raw);
}

// The tile only exposes what the hook actually calls on it — pointer capture. Both a real DOM
// element (Element has these methods) and a test double satisfy it, so no cast is ever needed.
type CaptureTarget = {
  setPointerCapture: (id: number) => void;
  releasePointerCapture: (id: number) => void;
};

// The subset of a pointer event the handlers read. A React PointerEvent is assignable to this — its
// currentTarget is an Element, which has the capture methods — and so is a plain test object. Typing
// the handlers to this (not React's PointerEvent) is what lets the hook be unit-tested without `as`.
type DragPointer = {
  pointerId: number;
  clientX: number;
  clientY: number;
  currentTarget: CaptureTarget;
};

type Session<T> = {
  pointerId: number;
  node: CaptureTarget;
  startX: number;
  startY: number;
  curIndex: number;
  order: T[];
  activated: boolean;
  moved: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

type TileHandlers = {
  'data-reorder-index': number;
  onPointerDown: (e: DragPointer) => void;
  onPointerMove: (e: DragPointer) => void;
  onPointerUp: (e: DragPointer) => void;
  onPointerCancel: (e: DragPointer) => void;
};

export type GridReorder<T> = {
  items: T[]; // the order to render (optimistic while dragging, server order otherwise)
  dragIndex: number | null; // the lifted tile's current slot, for styling
  tileProps: (index: number) => TileHandlers;
  consumeDragClick: () => boolean; // tile onClick calls this; true = a drag happened, cancel the tap
};

// Long-press drag-reorder for a tile grid, no dependency. A plain press/release stays a tap; holding
// ~400ms lifts the tile, then pointer moves reorder via elementFromPoint. On drop the new order is
// handed to onReorder. Pointer capture (taken only once the long press fires) routes the move/up
// events to the origin node, so a drag that wanders off the tile still tracks. See
// docs/superpowers/specs/2026-07-12-keypad-reorder-design.md.
export function useGridReorder<T extends { name: string }>(
  items: T[],
  onReorder: (ordered: T[]) => void,
): GridReorder<T> {
  const [override, setOverride] = useState<T[] | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const shown = override ?? items;

  // Once the server revalidates with the persisted order, drop the optimistic copy.
  useEffect(() => setOverride(null), [items]);

  const session = useRef<Session<T> | null>(null);
  const draggedClick = useRef(false);

  const end = useCallback(
    (s: Session<T>) => {
      if (s.timer) clearTimeout(s.timer);
      try {
        s.node.releasePointerCapture(s.pointerId);
      } catch {
        // not captured (never activated, or unsupported) — nothing to release
      }
      session.current = null;
      setDragIndex(null);
      if (s.activated) {
        draggedClick.current = true; // eat the click the release synthesizes on touch
        if (s.moved) onReorder(s.order);
      }
    },
    [onReorder],
  );

  const onPointerDown = useCallback(
    (index: number, e: DragPointer) => {
      if (session.current) return;
      const node = e.currentTarget;
      const pointerId = e.pointerId;
      const s: Session<T> = {
        pointerId,
        node,
        startX: e.clientX,
        startY: e.clientY,
        curIndex: index,
        order: shown,
        activated: false,
        moved: false,
        timer: null,
      };
      s.timer = setTimeout(() => {
        s.activated = true;
        s.timer = null;
        try {
          node.setPointerCapture(pointerId);
        } catch {
          // unsupported (e.g. jsdom) — drag still works via elementFromPoint
        }
        setDragIndex(index);
        setOverride(s.order);
      }, LONG_PRESS_MS);
      session.current = s;
    },
    [shown],
  );

  const onPointerMove = useCallback((e: DragPointer) => {
    const s = session.current;
    if (!s || s.pointerId !== e.pointerId) return;
    if (!s.activated) {
      // Pre-activation: a real move means the user is scrolling/flicking, not holding to drag.
      if (Math.hypot(e.clientX - s.startX, e.clientY - s.startY) > CANCEL_DIST) {
        if (s.timer) clearTimeout(s.timer);
        session.current = null;
      }
      return;
    }
    const over = indexAtPoint(e.clientX, e.clientY);
    if (over === null || over === s.curIndex) return;
    s.order = moveItem(s.order, s.curIndex, over);
    s.curIndex = over;
    s.moved = true;
    setOverride(s.order);
    setDragIndex(over);
  }, []);

  const onPointerUp = useCallback(
    (e: DragPointer) => {
      const s = session.current;
      if (!s || s.pointerId !== e.pointerId) return;
      end(s);
    },
    [end],
  );

  const tileProps = useCallback(
    (index: number): TileHandlers => ({
      'data-reorder-index': index,
      onPointerDown: (e) => onPointerDown(index, e),
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    }),
    [onPointerDown, onPointerMove, onPointerUp],
  );

  const consumeDragClick = useCallback(() => {
    if (draggedClick.current) {
      draggedClick.current = false;
      return true;
    }
    return false;
  }, []);

  return { items: shown, dragIndex, tileProps, consumeDragClick };
}
```

> Why this typechecks with no `as`: the handlers take the small structural `DragPointer`, not React's `PointerEvent`. Spreading `{...tileProps(i)}` onto a `<button>` still satisfies React's `PointerEventHandler` (a real `PointerEvent` is assignable to `DragPointer`, so the handler is assignable to the slot by function-parameter contravariance), and the test's plain objects match `DragPointer` directly. `document.elementFromPoint` is mocked to return a real DOM `<button>`, so its return type is already `Element` — no cast on the mock either.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/features/entries/use-grid-reorder.test.ts`
Expected: PASS (moveItem + all three hook tests).

- [ ] **Step 6: Quality gates**

Run: `npm run format:files src/features/entries/use-grid-reorder.ts src/features/entries/use-grid-reorder.test.ts && npm run typecheck && npm run lint && npm test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/entries/use-grid-reorder.ts src/features/entries/use-grid-reorder.test.ts
git commit -m "feat(features): add useGridReorder long-press drag hook" -m "Hand-rolled Pointer-Events reorder, no dependency: a ~400ms long press lifts a tile, elementFromPoint tracks the drop target, and pointer capture keeps the drag alive off-tile. moveItem is the pure reorder core. consumeDragClick lets a tile cancel the tap a drop would otherwise synthesize." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01Nd89nCpyxLn93xrssoVHE8"
```

---

## Task 5: Wire both keypad grids to the drag hook

**Files:**
- Modify: `src/features/entries/ui/Keypad.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/features/entries/ui/Keypad.tsx`, after the existing imports, add:

```ts
import { useGridReorder } from '../use-grid-reorder';
import { reorderCategories } from '@features/categories/actions';
import { reorderAccounts } from '@features/accounts/actions';
```

- [ ] **Step 2: Create the two reorder controllers**

Inside the `Keypad` component body, right after the existing `useState` calls (after the `account` state), add:

```ts
  const catGrid = useGridReorder(categories, (ordered) =>
    reorderCategories(ordered.map((c) => c.name)),
  );
  const accGrid = useGridReorder(accounts, (ordered) =>
    reorderAccounts(ordered.map((a) => a.name)),
  );
```

- [ ] **Step 3: Wire the account grid**

Replace `accounts.map((a) => {` with `accGrid.items.map((a, i) => {` and update the `<button>` that renders each account tile so it:
- spreads `{...accGrid.tileProps(i)}`,
- guards its `onClick` with `consumeDragClick`,
- lifts when dragged.

The tile becomes:
```tsx
            <button
              key={a.name}
              type="button"
              {...accGrid.tileProps(i)}
              onClick={() => {
                if (accGrid.consumeDragClick()) return; // a drag just ended — don't select
                setAccount(a.name);
                setView('keypad');
              }}
              aria-pressed={on}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] border px-2 text-center text-xs font-medium transition-transform active:opacity-70"
              style={{
                ...(on
                  ? {
                      background: 'var(--color-accent)',
                      color: 'var(--color-on-accent)',
                      borderColor: 'var(--color-accent)',
                    }
                  : { background: 'var(--color-surface-2)', color: 'var(--color-text)' }),
                ...(accGrid.dragIndex === i
                  ? { transform: 'scale(1.06)', opacity: 0.9, zIndex: 10, pointerEvents: 'none' }
                  : {}),
                touchAction: 'manipulation',
              }}
            >
```
(Keep the inner `<AccountIcon .../>` and `<span>` unchanged. Note `className` changed `transition-colors` → `transition-transform` so the lift animates.)

- [ ] **Step 4: Wire the category grid**

Replace `categories.map((c) => (` with `catGrid.items.map((c, i) => (` and update the submit tile:
```tsx
            <button
              key={c.name}
              type="submit"
              name="category"
              value={c.name}
              {...catGrid.tileProps(i)}
              onClick={(e) => {
                if (catGrid.consumeDragClick()) e.preventDefault(); // a drag just ended — don't submit
              }}
              className="panel flex flex-col items-center gap-1 px-2 py-3 text-center transition-transform active:opacity-70"
              style={{
                ...(entry?.category === c.name
                  ? {
                      borderColor: 'var(--color-accent)',
                      boxShadow: 'inset 0 0 0 1px var(--color-accent)',
                    }
                  : {}),
                ...(catGrid.dragIndex === i
                  ? { transform: 'scale(1.06)', opacity: 0.9, zIndex: 10, pointerEvents: 'none' }
                  : {}),
                touchAction: 'manipulation',
              }}
            >
```
(Keep the inner `<CategoryIcon .../>` and `<span>` unchanged.)

- [ ] **Step 5: Quality gates**

Run: `npm run format:files src/features/entries/ui/Keypad.tsx && npm run typecheck && npm run lint && npm test`
Expected: all PASS.

- [ ] **Step 6: Manual verification (touch drag can't be unit-tested end-to-end)**

Run: `npm run dev:web` and open `http://127.0.0.1:4010/entries/new`.
Verify, using the browser devtools device toolbar (touch emulation) or a phone:
1. Type an amount → **Choose category**. **Tap** a category tile → the expense still submits (records page shows the new row). ✅ tap unaffected.
2. Back on the category grid, **long-press** (~0.5s) a tile until it lifts, drag it over another tile, release → the tiles reorder, and **no expense is submitted** on release. ✅ drag + click-suppression.
3. Reload `/entries/new` → the category grid keeps the new order. ✅ persistence.
4. Repeat 1–3 on the **account** grid (open via the account chip): long-press-drag reorders, a plain tap still selects the account and returns to the keypad.
5. Confirm untouched: `/categories` and `/accounts` lists are still count-sorted; the home donut is still spend-sorted.

Stop the dev server when done.

- [ ] **Step 7: Commit**

```bash
git add src/features/entries/ui/Keypad.tsx
git commit -m "feat(features): drag-reorder the keypad category and account grids" -m "Wire both keypad tile grids to useGridReorder: long-press-drag rearranges them, the order persists via reorderCategories/reorderAccounts, and a drop no longer fires the tile's submit/select. Tapping still logs the expense / picks the account." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01Nd89nCpyxLn93xrssoVHE8"
```

---

## Done-when

- Long-press-drag rearranges both keypad grids; the order survives reload.
- A plain tap still submits the expense (category) / selects the account.
- `/categories`, `/accounts`, and both donut+breakdown surfaces are unchanged.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm test` all pass.

## Deferred (out of scope — see spec)

- Pin boolean / two-tier pinned section.
- Manual order on `/categories`, `/accounts`, or analytics.
- Keyboard-driven reorder; drag auto-scroll near grid edges (add only if a tall grid proves unreachable mid-drag).

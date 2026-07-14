# WASM-SQLite/OPFS Migration — Plan 2b: Client Write Layer + Reactive Refresh

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Convert the remaining Server Actions (`budgets`, `accounts`, `settings`) to client-side OPFS writes, and add a **reactive refresh** so a write repaints the affected reads WITHOUT a full page reload — the piece Plan 2a deferred. After this, every `src/features/*/actions.ts` compiles and mutations are live; only the 10 page components remain server-bound (Plan 2b-2).

**Architecture:** A tiny global **data-version store** (`useSyncExternalStore`): write functions call `bumpDataVersion()` after a successful OPFS write; read-hooks subscribe via `useDataVersion()` and include it in their effect deps, so they refetch on any bump. This mirrors Plan 2a's action-conversion pattern (drop `'use server'`/`revalidatePath`/`ensure*`, use `getBrowserDb`, React 19 accepts client fns as `<form action>` so call sites are unchanged) and retrofits the categories/entries actions (converted in 2a) to bump too.

**Tech Stack:** React 19 (`useSyncExternalStore`), drizzle `sqlite-proxy`, browser OPFS worker (`getBrowserDb`), Vitest + `@testing-library/react` (`renderHook`). TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-07-11-wasm-sqlite-opfs-pwa-design.md`.

**Depends on:** Plan 1 + Plan 2a (both on `feat/wasm-sqlite-opfs-pwa`). `getBrowserDb` (concurrency-safe), the async feature queries, and the converted `categories/actions.ts` + `entries/actions.ts` all exist.

**Scope boundary:**
- **Plan 2b-2 (next):** convert the 10 remaining `src/app/**/page.tsx` (+ `entries/new`, `entries/[id]/edit`) to client components loading via `use-*` hooks (each wired to `useDataVersion`), and `settings/backup/export/route.ts` → a client-side CSV download.
- **Plan 2b-3 (last):** delete `src/middleware.ts`, flip `next.config` to `output: 'export'`, remove any remaining `force-dynamic`, full-app browser verification, whole-branch review, merge.
- NOT in this plan: page conversions, static export, middleware deletion.

## Global Constraints

- **TypeScript strict:** no `any`, no `as` (except `as const`), no `!`, no `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`. `type` over `interface`. `for..of` over `.forEach`.
- **Offline-first writes:** actions are plain client async functions (no `'use server'`, no `revalidatePath`, no `redirect`, no `ensure*Table` — the worker bootstraps the schema). Each write calls `bumpDataVersion()` on success.
- **Call sites unchanged:** React 19 accepts client async functions as `<form action={fn}>`; direct-call actions stay direct calls. Do NOT edit the ~19 components that import actions.
- **Refresh store is UI infra** in `src/shared/` (features → shared is allowed); actions import `bumpDataVersion`, read-hooks import `useDataVersion`.
- **Shell:** Git Bash (POSIX). Verify via `npm test` + `npm run typecheck` (grep the kuman-ctx saved log if truncated).
- **Commit format:** `type(scope): subject` + body. Scopes: `db`, `features`, `shared`.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/shared/data-version.ts` (+ `.test.ts`) | Global mutation-version store: `bumpDataVersion()`, `useDataVersion()` | **Create** |
| `src/features/entries/use-home.ts` | Home read-hook | **Modify** — refetch on `useDataVersion()` |
| `src/features/entries/use-search-suggestions.ts` | Chrome read-hook | **Modify** — refetch on `useDataVersion()` |
| `src/features/categories/actions.ts` | Category writes (from 2a) | **Modify** — `bumpDataVersion()` after each write |
| `src/features/entries/actions.ts` | Entry/category/trip/import writes (from 2a) | **Modify** — `bumpDataVersion()` after each write |
| `src/features/budgets/actions.ts` | Budget writes | **Rewrite** — client OPFS writes + bump |
| `src/features/accounts/actions.ts` | Account writes | **Rewrite** — client OPFS writes + bump |
| `src/features/settings/actions.ts` | Settings/FX writes | **Rewrite** — client OPFS writes + bump |

---

## Task 1: The data-version refresh store

A minimal external store: an integer version + a listener set. `bumpDataVersion()` increments and notifies; `useDataVersion()` subscribes via `useSyncExternalStore` and returns the current version (a value that changes on every write, safe to use in effect deps).

**Files:** Create `src/shared/data-version.ts`, `src/shared/data-version.test.ts`

**Interfaces produced:** `bumpDataVersion(): void`, `useDataVersion(): number`

- [ ] **Step 1: Write the failing test**

`src/shared/data-version.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { bumpDataVersion, useDataVersion } from './data-version';

describe('data-version', () => {
  it('re-renders subscribers with a new value on bump', () => {
    const { result } = renderHook(() => useDataVersion());
    const before = result.current;
    act(() => bumpDataVersion());
    expect(result.current).toBe(before + 1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/shared/data-version.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

`src/shared/data-version.ts`:
```ts
'use client';
import { useSyncExternalStore } from 'react';

// Global mutation counter. Every successful OPFS write bumps it; read-hooks include useDataVersion() in
// their effect deps so they refetch. Single-user app, so a coarse "something changed → refetch all live
// reads" is correct and far simpler than per-query invalidation. Module-level (not React state) so a
// write in an action module can notify without a provider in the tree.
let version = 0;
const listeners = new Set<() => void>();

export function bumpDataVersion(): void {
  version += 1;
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function useDataVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => version, // server snapshot: stable 0 (no writes during SSR)
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/shared/data-version.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/shared/data-version.ts src/shared/data-version.test.ts
git commit -m "feat(shared): global data-version store for post-write reactive refresh"
```

---

## Task 2: Wire the read-hooks to refetch on data-version

`use-home` and `use-search-suggestions` currently load once on mount (and, for `use-home`, on `cycleKey`). Add `useDataVersion()` and include it in the effect deps so a write repaints them.

**Files:** Modify `src/features/entries/use-home.ts`, `src/features/entries/use-search-suggestions.ts`

- [ ] **Step 1: Add the dep to `use-search-suggestions`**

Import `useDataVersion` from `@shared/data-version`; `const version = useDataVersion();` in the hook; add `version` to the `useEffect` dependency array (alongside the existing empty/deps). The effect body is unchanged — it just re-runs when `version` changes.

- [ ] **Step 2: Add the dep to `use-home`**

Same: `const version = useDataVersion();`; add `version` to the effect deps (which already include `cycleKey`).

- [ ] **Step 3: Extend the existing hook tests**

In each hook's `.test.ts`, add a case: render the hook, mutate the mocked db (insert a row), call `act(() => bumpDataVersion())`, `await waitFor(...)` and assert the hook's data reflects the new row. (Reuse the existing mock harness; import `bumpDataVersion` from `@shared/data-version`.)

- [ ] **Step 4: Run tests**

Run: `npm test -- src/features/entries/use-home.test.ts src/features/entries/use-search-suggestions.test.ts` → PASS (existing + new cases).

- [ ] **Step 5: Commit**
```bash
git add src/features/entries/use-home.ts src/features/entries/use-search-suggestions.ts src/features/entries/use-home.test.ts src/features/entries/use-search-suggestions.test.ts
git commit -m "feat(entries): read-hooks refetch on data-version bump (live post-write refresh)"
```

---

## Task 3: Retrofit the 2a-converted actions to bump

`categories/actions.ts` and `entries/actions.ts` were converted to client writes in Plan 2a but don't yet notify the refresh store. Add `bumpDataVersion()` after each successful write.

**Files:** Modify `src/features/categories/actions.ts`, `src/features/entries/actions.ts`

- [ ] **Step 1: categories/actions.ts**

Import `bumpDataVersion` from `@shared/data-version`. At the END of each of `setCategoryEmojiAction`, `setCategoryHueAction`, `reorderCategories` (after the `await set*` call), add `bumpDataVersion();`. (For the early-return validation guards, no bump — nothing was written.)

- [ ] **Step 2: entries/actions.ts**

Import `bumpDataVersion`. Add `bumpDataVersion();` after the successful write in each of: `addEntryAction`, `editEntryAction`, `deleteEntryAction`, `mergeCategoryAction`, `renameTrip`, `addCategoryAction`, `deleteCategoryAction`, `importBackupAction` (after `await restoreEntries`, before the `return`). Not after early-return guards.

- [ ] **Step 3: Typecheck + tests**

Run: `npm run typecheck 2>&1` → zero errors in both action files. `npm test` → still green (no test regressions).

- [ ] **Step 4: Commit**
```bash
git add src/features/categories/actions.ts src/features/entries/actions.ts
git commit -m "feat(features): categories + entries writes bump data-version"
```

---

## Task 4: Convert `budgets/actions.ts` to client writes

**Files:** Modify `src/features/budgets/actions.ts` (read it first for the exact functions/signatures)

- [ ] **Step 1: Read the current file** to list every exported action + its params/return.

- [ ] **Step 2: Convert** — apply the Plan 2a pattern to every action:
  - Remove `'use server'`, the `initDb`/`ensure*Table` imports+calls, and `revalidatePath` (import + calls).
  - Import `getBrowserDb` from `@db/browser` and `bumpDataVersion` from `@shared/data-version`.
  - Each action: `const db = await getBrowserDb();` then `await <the budgets query>(db, ...)` (the query fns — `setBudget`/`deleteBudget` — are already async from Plan 1), then `bumpDataVersion();`.
  - Keep each function's name, params, and return type identical (call sites unchanged).

- [ ] **Step 3: Typecheck** → zero errors in `budgets/actions.ts`. `npm test` → green.

- [ ] **Step 4: Commit**
```bash
git add src/features/budgets/actions.ts
git commit -m "refactor(budgets): actions become client OPFS writes + data-version bump"
```

---

## Task 5: Convert `accounts/actions.ts` to client writes

**Files:** Modify `src/features/accounts/actions.ts` (read it first)

- [ ] **Step 1: Read the current file** — list every exported action (account rename/merge/delete/add/icon/hue/order, etc.) + signatures. Note any that return a value (e.g. a merge snapshot for undo) — preserve the return.

- [ ] **Step 2: Convert** per the Task 4 pattern: drop `'use server'`/`initDb`/`ensure*`/`revalidatePath`; `getBrowserDb` + `await` the (already-async) accounts queries; `bumpDataVersion()` after each write; preserve names/params/returns. Any `redirect` → drop it with a `// TODO(Plan 2b-2): navigate from the caller` (as done for entries add/edit in 2a).

- [ ] **Step 3: Typecheck** → zero errors in `accounts/actions.ts`. `npm test` → green.

- [ ] **Step 4: Commit**
```bash
git add src/features/accounts/actions.ts
git commit -m "refactor(accounts): actions become client OPFS writes + data-version bump"
```

---

## Task 6: Convert `settings/actions.ts` to client writes

**Files:** Modify `src/features/settings/actions.ts` (read it first)

- [ ] **Step 1: Read the current file** — list every exported action (cutoff, icon set, card fee, FX rates, wipe-all-data, etc.) + signatures/returns.

- [ ] **Step 2: Convert** per the Task 4 pattern: drop `'use server'`/`initDb`/`ensure*`/`revalidatePath`; `getBrowserDb` + `await` the (already-async) settings queries (`setCutoff`/`setIconSet`/`setCardFeePct`/`setFxRates`, and `wipeAllData` from `settings/data.ts`); `bumpDataVersion()` after each write; preserve names/params/returns. If an action fetches FX from the network, keep that fetch — only the DB access changes.

- [ ] **Step 3: Typecheck — and confirm the residual is pages-only**

Run: `npm run typecheck 2>&1`. Zero errors in `settings/actions.ts`. Then confirm EVERY remaining error is in `src/app/**` (pages) or `src/app/settings/backup/export/route.ts` — i.e. NO `src/features/**` error remains. Grep the saved log: `grep -E "src/features/" <log>` should return nothing. If it does, that feature file needs its conversion finished.

- [ ] **Step 4: Commit**
```bash
git add src/features/settings/actions.ts
git commit -m "refactor(settings): actions become client OPFS writes + data-version bump"
```

---

## Task 7: Green gate for the write layer

**Files:** none (verification only)

- [ ] **Step 1: Full suite** — `npm test` → all green (incl. the new data-version + hook-refresh tests).

- [ ] **Step 2: Lint** — `npx eslint "src/features/**/actions.ts" src/shared/data-version.ts "src/features/entries/use-*.ts"` → clean.

- [ ] **Step 3: Typecheck residual** — `npm run typecheck`; confirm every remaining error is under `src/app/**` (the 10 pages + the backup route) — that set is exactly Plan 2b-2's scope. NO `src/features/**` or `src/db/**` or `src/shared/**` error should remain.

- [ ] **Step 4: Commit any formatting**
```bash
git add -A && git commit -m "chore(features): format + lint pass for the client write layer"
```

---

## Self-Review

**Spec coverage:** reactive post-write refresh (Tasks 1–3 — the store + read-hook wiring + retrofit ✓); all Server Actions → client OPFS writes (Tasks 3–6, all 5 feature action files ✓); call sites untouched (React 19 client `<form action>` — Global Constraints ✓). Deferred to 2b-2 (pages + backup route → client) and 2b-3 (middleware delete, static export, full verification, merge) — explicit in the scope boundary.

**Placeholder scan:** Tasks 4–6 say "read the file first" rather than pre-pasting each action's body because they follow ONE explicit pattern (shown fully in Task 4) applied to already-async query fns; the per-file specifics that matter (which query each action calls, which return values to preserve, dropping `redirect`) are called out. No "TBD".

**Type consistency:** `bumpDataVersion(): void` / `useDataVersion(): number` defined in Task 1, consumed verbatim in Tasks 2–6. Action function names/params/returns are explicitly preserved so the ~19 unchanged call sites keep typechecking. `getBrowserDb`/the async queries are Plan-1/2a interfaces, unchanged.

**Open risk (flagged):** the read-hook refetch on every `version` bump is coarse (any write refetches all live hooks). For a single-user app with a handful of live hooks this is fine; if a future screen has many independent live queries, switch to keyed invalidation. Documented, not silently assumed.

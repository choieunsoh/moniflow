# WASM-SQLite/OPFS Migration — Plan 2b-2: Convert the Remaining Pages to Client Reads

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Convert the 8 remaining server-rendered pages (and the CSV-export route) to client components that load their data from the browser OPFS db — clearing the last ~87 typecheck errors so the WHOLE app compiles and runs offline-first. This is the first point every route works in the browser.

**Architecture:** Apply the proven Plan 2a home-page pattern to each page: `'use client'`, load DB data in a per-page `use-*` hook (`getBrowserDb()` + the async queries, wired to `useDataVersion()` so writes repaint), read URL state from `useSearchParams`, show a calm loading state until `ready`. Remove `initDb`/`ensure*`/`force-dynamic`. Pure helpers (cycle/donut/breakdown/trips/budget-status math) are unchanged and called from the hook. The CSV-export GET route becomes a client-side download button.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19 (`useSearchParams`, `useSyncExternalStore` via `useDataVersion`), drizzle `sqlite-proxy`, browser OPFS worker. TypeScript strict. `renderHook` tests for the new hooks.

**Spec:** `docs/superpowers/specs/2026-07-11-wasm-sqlite-opfs-pwa-design.md`.

**Depends on:** Plans 1, 2a, 2b (all on `feat/wasm-sqlite-opfs-pwa`). `getBrowserDb`, all async queries, all client-write actions, `useDataVersion`, and the home page + its `use-home`/`use-search-suggestions` hooks (the reference implementation) exist.

**Scope boundary (Plan 2b-3, last):** delete `src/middleware.ts`, `next.config` → `output: 'export'`, remove any residual `force-dynamic`, whole-app live browser verification (every route + a write-repaints-without-reload check), whole-branch review, merge. NOT in this plan.

## The conversion template (reference: `src/app/page.tsx` + `src/features/entries/use-home.ts`)

For each page `src/app/<route>/page.tsx`:
1. **Create `src/features/<domain>/use-<route>.ts`** (`'use client'`): a hook that takes the page's URL inputs (cycle/filter/id/etc.) as args, and in a `useEffect` (deps include those inputs **and** `useDataVersion()`): `const db = await getBrowserDb()`, `await` every query the page currently calls, derive the rest via the SAME pure helpers, and expose `{ ready, data }` where `data` bundles exactly what the page renders. Add a `renderHook` test (mock `@db/browser` → seeded `makeNodeProxyDb()`), matching the harness in `use-home.test.ts`.
2. **Rewrite the page** `'use client'`: delete `export const dynamic`, the `initDb`/`ensure*`/DB-query imports (they move to the hook); read params via `useSearchParams()`; `const { ready, data } = use<Route>(...)`; render a minimal loading placeholder while `!ready || !data`; otherwise render the EXISTING JSX sourced from `data.*`. Keep child components + `<Link>`/`<form action>` usages unchanged (actions are already client writes from Plan 2b).
3. **Verify** the page + hook typecheck clean and the hook test passes.

## Global Constraints

- **TypeScript strict:** no `any`, no `as` (except `as const`), no `!`, no ts-suppression comments. `type` over `interface`. `for..of` over `.forEach`.
- **Every read-hook includes `useDataVersion()` in its effect deps** so writes repaint it.
- **No page keeps `export const dynamic = 'force-dynamic'`.** No page imports `initDb`.
- **Pure logic modules are unchanged** — only the data source moves.
- **Shell:** Git Bash. Verify via `npm test` + `npm run typecheck` (read the kuman-ctx SAVED LOG for the real error count — a piped `grep -c` returns a false 0 under the compressor).
- **Commit format:** `type(scope): subject` + body. Scope = the route's feature (`entries`, `budgets`, `categories`, `accounts`, `settings`).

---

## Task 1: `records` page (`/records`)

**Files:** Create `src/features/entries/use-records.ts` (+ test); Modify `src/app/records/page.tsx`

- [ ] **Step 1:** Read `src/app/records/page.tsx` — note its URL inputs (likely `cycle`, `category`, maybe `q`/search) and every query it calls (e.g. `getEntriesInRange`/`getEntriesByCategory`/`searchEntries`, plus emoji/hue/icon maps + `getCutoff`).
- [ ] **Step 2:** Create `use-records.ts` per the template (inputs = its search params; deps include them + `useDataVersion()`), + a `renderHook` test (seeded db → assert the rows/groups). FAIL→PASS.
- [ ] **Step 3:** Rewrite `records/page.tsx` to `'use client'` + `useSearchParams` + `useRecords(...)` + loading state + existing JSX from `data.*`.
- [ ] **Step 4:** `npm run typecheck` (saved log) → zero errors in `records/page.tsx` + `use-records.ts`. `npm test` → green.
- [ ] **Step 5:** Commit `refactor(entries): records page loads client-side via use-records`.

---

## Task 2: `budgets` page (`/budgets`)

**Files:** Create `src/features/budgets/use-budgets-page.ts` (+ test); Modify `src/app/budgets/page.tsx` (254 lines — the largest)

- [ ] **Step 1:** Read `budgets/page.tsx` — inputs (cycle) + queries (`getBudgets`, `getCategoryBreakdown`/spend for the cycle, cutoff, category maps) + the budget-status pure helpers it uses.
- [ ] **Step 2:** Create `use-budgets-page.ts` per template + `renderHook` test. FAIL→PASS.
- [ ] **Step 3:** Rewrite the page (`'use client'`, params, hook, loading, existing JSX). The per-category `BudgetField` `<form action>` writes already bump `useDataVersion` (Plan 2b), so edits will repaint.
- [ ] **Step 4:** Typecheck (saved log) zero errors in both files; `npm test` green.
- [ ] **Step 5:** Commit `refactor(budgets): budgets page loads client-side via use-budgets-page`.

---

## Task 3: `categories` page (`/categories`)

**Files:** Create `src/features/categories/use-categories-page.ts` (+ test); Modify `src/app/categories/page.tsx`

- [ ] **Step 1:** Read the page — queries (`getCategoryCounts`, emoji/hue/order maps, icon set). Likely no URL inputs (or a sort param).
- [ ] **Step 2:** Create the hook + `renderHook` test. FAIL→PASS.
- [ ] **Step 3:** Rewrite the page per template. Add/rename/delete/reorder actions already bump.
- [ ] **Step 4:** Typecheck (saved log) + tests.
- [ ] **Step 5:** Commit `refactor(categories): categories page loads client-side via use-categories-page`.

---

## Task 4: `accounts` page (`/accounts`)

**Files:** Create `src/features/accounts/use-accounts-page.ts` (+ test); Modify `src/app/accounts/page.tsx`

- [ ] **Step 1:** Read the page — inputs (cycle) + queries (`getAccountCounts`, `getAccountBreakdown`, `getAccountsByUsage`, icon/hue/order maps, cutoff). Mirrors the home page's donut/breakdown shape.
- [ ] **Step 2:** Create the hook + `renderHook` test. FAIL→PASS.
- [ ] **Step 3:** Rewrite the page per template.
- [ ] **Step 4:** Typecheck (saved log) + tests.
- [ ] **Step 5:** Commit `refactor(accounts): accounts page loads client-side via use-accounts-page`.

---

## Task 5: `trips` page (`/trips`)

**Files:** Create `src/features/entries/use-trips.ts` (+ test); Modify `src/app/trips/page.tsx`

- [ ] **Step 1:** Read the page — queries (`getForeignEntries` or `getTripEntries`, `getTripTitles`) + the `groupIntoTrips`/`tripId` pure helpers.
- [ ] **Step 2:** Create the hook + `renderHook` test. FAIL→PASS.
- [ ] **Step 3:** Rewrite the page per template. The trip-rename `<form action>` (renameTrip) already bumps.
- [ ] **Step 4:** Typecheck (saved log) + tests.
- [ ] **Step 5:** Commit `refactor(entries): trips page loads client-side via use-trips`.

---

## Task 6: `settings` page (`/settings`) + CSV-export route

**Files:** Create `src/features/settings/use-settings.ts` (+ test); Modify `src/app/settings/page.tsx`, `src/app/settings/backup/export/route.ts`

- [ ] **Step 1:** Read `settings/page.tsx` — queries (`getCutoff`, `getIconSet`, `getCardFeePct`, maybe FX rates, distinct data for backup). Read `backup/export/route.ts` — it's a GET handler that reads the DB + serializes Monefy CSV server-side.
- [ ] **Step 2:** Create `use-settings.ts` (loads the settings values, `useDataVersion` deps so a cutoff/icon change repaints) + `renderHook` test. FAIL→PASS.
- [ ] **Step 3:** Rewrite `settings/page.tsx` per template.
- [ ] **Step 4: Convert the export route → client download.** A static-export app has no GET route handler, so the CSV export moves to the client: in the settings Backup UI, an "Export" button that calls `getBrowserDb()` → reads entries → `serializeMonefyCsv(...)` → builds a `Blob` → triggers a download (create an object URL on an `<a download>` and click it). **Delete `src/app/settings/backup/export/route.ts`.** (Reuse the existing `serializeMonefyCsv` from the CSV-backup feature.) Wire the button where the current export link lives.
- [ ] **Step 5:** Typecheck (saved log) → zero errors in the settings files; `npm test` green.
- [ ] **Step 6:** Commit `refactor(settings): settings page + client CSV export (drop the server route)`.

---

## Task 7: `entries/new` page (`/entries/new`)

**Files:** Create `src/features/entries/use-new-entry.ts` (+ test) *if the keypad needs DB-derived lists*; Modify `src/app/entries/new/page.tsx`

- [ ] **Step 1:** Read `entries/new/page.tsx` — it feeds the keypad the DB-derived lists (`getKeypadCategories`/`getKeypadAccounts`/`getKeypadCurrencies`, already async) + latest account + FX. Note it's a form page; the `addEntryAction` is already a client write (Plan 2b) but **no longer navigates** (its redirect was dropped).
- [ ] **Step 2:** Create `use-new-entry.ts` loading the keypad lists (+ `useDataVersion` deps) + test. FAIL→PASS.
- [ ] **Step 3:** Rewrite the page `'use client'` + hook + loading. **Restore post-submit navigation the offline way:** the keypad's submit handler awaits `addEntryAction(formData)` then `useRouter().push('/')` (replacing the server redirect the action used to do). Keep the keypad component otherwise unchanged.
- [ ] **Step 4:** Typecheck (saved log) + tests.
- [ ] **Step 5:** Commit `refactor(entries): new-entry page client-side (keypad lists + post-submit nav)`.

---

## Task 8: `entries/[id]/edit` page (`/entries/[id]/edit`)

**Files:** Create `src/features/entries/use-edit-entry.ts` (+ test); Modify `src/app/entries/[id]/edit/page.tsx`

- [ ] **Step 1:** Read the page — loads the entry by id (`getEntryById`) + the keypad lists. The `id` comes from the route `params` (a `Promise<{ id }>` in Next 16) — in a client component read it via `useParams()` instead.
- [ ] **Step 2:** Create `use-edit-entry.ts(id)` loading the entry + keypad lists (+ `useDataVersion`) + test. FAIL→PASS. Handle the not-found case (`getEntryById` → undefined) — the hook returns `{ ready, data: null }` and the page shows a "not found" state or redirects.
- [ ] **Step 3:** Rewrite the page `'use client'` + `useParams` + hook + loading. `editEntryAction` already a client write; add `useRouter().push('/records')` after submit (its redirect was dropped).
- [ ] **Step 4:** Typecheck (saved log) + tests.
- [ ] **Step 5:** Commit `refactor(entries): edit-entry page client-side (load by id + post-submit nav)`.

---

## Task 9: Whole-app green gate

**Files:** none (verification only)

- [ ] **Step 1: Full suite** — `npm test` → all green (incl. every new page hook test).
- [ ] **Step 2: Typecheck is now CLEAN** — `npm run typecheck`; read the SAVED LOG. Expected: **zero errors project-wide** (every page converted; `initDb`/`force-dynamic` gone). If any remain, they name the page/hook to finish. This is the milestone: the whole app typechecks for the first time since Plan 1.
- [ ] **Step 3: Lint** — `npm run lint` → clean (fix any `no-floating-promises`/unused from the conversions).
- [ ] **Step 4: Commit** any formatting: `chore(app): format + lint pass for the client page conversions`.

> Live browser verification of every route (and a write-repaints-without-reload check) is Plan 2b-3, together with the `output: 'export'` flip and middleware deletion — because a couple of these pages can only be fully exercised once the static-export config and PWA shell are in place.

## Self-Review

**Spec coverage:** all 8 remaining pages → client reads via per-page `use-*` hooks wired to `useDataVersion` (Tasks 1–8 ✓); the server CSV route → client download (Task 6 ✓); post-submit navigation restored client-side for the two entry forms whose action redirect was dropped in 2b (Tasks 7–8 ✓); whole-app typecheck clean (Task 9 ✓). Deferred to 2b-3 (static export, middleware delete, full live verification, merge) — explicit in the scope boundary.

**Placeholder scan:** each task says "read the page first" and names the specific queries/inputs/pure-helpers rather than pre-pasting per-page JSX, because all 8 follow ONE fully-worked template (`page.tsx` + `use-home.ts`), and the per-page specifics that vary (queries, params, not-found handling, post-submit nav) are called out per task. No "TBD".

**Type consistency:** every hook returns `{ ready, data }` with `data` the exact set its page renders; `useDataVersion`/`getBrowserDb`/the async queries/pure helpers are all prior-plan interfaces, unchanged. `useParams`/`useSearchParams` replace the server `params`/`searchParams` props. No `initDb`/`force-dynamic` remains after Task 9.

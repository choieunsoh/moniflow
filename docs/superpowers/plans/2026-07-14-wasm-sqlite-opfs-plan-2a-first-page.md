# WASM-SQLite/OPFS Migration — Plan 2a: Prove the Browser Runtime (bundling + shell + home page)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Get moniflow's data actually flowing through the browser OPFS/WASM worker for the FIRST time — solve the Turbopack/sqlite-wasm bundling blocker, convert the shared shell (`layout.tsx`) and the home page (`/`) from server-rendered `initDb` reads to client-side `getBrowserDb` reads, and verify the round-trip live in a real browser. This is the de-risking vertical slice before Plan 2b converts the remaining 10 pages + 5 actions.

**Architecture:** Self-host the sqlite3 dist in `/public` and load it inside the worker via a `turbopackIgnore` dynamic import, so `@sqlite.org/sqlite-wasm`'s un-bundleable `sqlite3-worker1.mjs` never enters the Turbopack graph (we use the SAHPool VFS, which doesn't need it). Split `layout.tsx` into a thin server layout (metadata/viewport/`<html>`) + a `'use client'` `AppShell` that loads DB-derived chrome (search suggestions, icon set) through a hook. Convert the home page to a client component that loads its cycle data through a `use-home` hook. Feature reads/writes are already async (Plan 1). No page keeps `force-dynamic`.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, `@sqlite.org/sqlite-wasm` (SAHPool VFS, self-hosted), drizzle `sqlite-proxy`, Playwright (browser verification). TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-07-11-wasm-sqlite-opfs-pwa-design.md` (the "Plan split & Turbopack bundling resolution" section).

**Depends on:** Plan 1 (async data layer) — merged/present on this branch. `src/db/{worker,rpc,browser,client,node-proxy}.ts` and all async feature queries exist.

**Scope boundary (Plan 2b, later):** the other 10 pages (`records`, `budgets`, `categories`, `accounts`, `trips`, `settings`, `entries/new`, `entries/[id]/edit`), all 5 `features/*/actions.ts` (→ client writes), `settings/backup/export/route.ts`, deleting `middleware.ts`, and flipping `next.config` to `output: 'export'`. NOT in 2a — 2a keeps the dev server (SSR-shell) so we can iterate; the static-export flip lands in 2b once every route is client-loaded.

## Global Constraints

- **TypeScript strict:** no `any`, no `as` (except `as const`), no `!`, no `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`. `type` over `interface`. `for..of` over `.forEach`.
- **No new runtime dependencies.** sqlite3 is self-hosted from the already-installed `@sqlite.org/sqlite-wasm` package's dist.
- **Shell:** Git Bash (POSIX). Dev server: `npm run dev:web` (127.0.0.1:4010).
- **`db/` stays feature-free.** The worker keeps its own bootstrap DDL (Plan 1).
- **Money/tz semantics unchanged:** expenses `amount < 0`; Bangkok tz for display; `en-CA` UTC for date keys.
- **Custom hooks are first-class:** stateful client data-loading lives in `src/features/<domain>/use-*.ts` with a `renderHook` test where practical.
- **Commit format:** `type(scope): subject` + body. Scopes: `db`, `app`, `features`, `shared`.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `public/sqlite3/sqlite3.mjs`, `public/sqlite3/sqlite3.wasm` | Self-hosted sqlite3 runtime (not bundled) | **Create** (copied from package dist) |
| `scripts/copy-sqlite3.mjs` | Copy sqlite3 dist → `public/sqlite3/` (repeatable, postinstall-friendly) | **Create** |
| `src/db/worker.ts` | DB worker | **Modify** — load sqlite3 via `turbopackIgnore` dynamic import from `/sqlite3/`; type-only npm import |
| `src/app/layout.tsx` | Root layout | **Modify** — thin server layout (metadata/viewport/`<html>`), renders `<AppShell>`; drop `initDb` + `force-dynamic` |
| `src/shared/ui/AppShell.tsx` | `'use client'` chrome shell (provider + header + search + bottom bar) | **Create** |
| `src/features/entries/use-search-suggestions.ts` (+ test) | Hook: load distinct categories+accounts + icon set from `getBrowserDb` | **Create** |
| `src/app/page.tsx` | Home page | **Rewrite** — `'use client'`, loads via `use-home`, `useSearchParams`, loading state; drop `force-dynamic` |
| `src/features/entries/use-home.ts` (+ test) | Hook: load cycle summary/breakdown/budgets/maps for a cycle key | **Create** |
| `src/db/use-browser-db.ts` (optional) | Hook wrapping `getBrowserDb()` + ready state, reused by feature hooks | **Create if it removes duplication** |

---

## Task 1: Self-host sqlite3 and load it in the worker without bundling it

Solve the blocker. Copy the sqlite3 dist into `/public`, and change `worker.ts` so sqlite3 is loaded at RUNTIME from `/sqlite3/` (via a `turbopackIgnore` dynamic import) instead of statically imported through the bundler. Keep the npm package as a **type-only** import so types survive. This keeps `sqlite3-worker1.mjs` out of the graph entirely.

**Files:** Create `scripts/copy-sqlite3.mjs`, `public/sqlite3/*`; Modify `src/db/worker.ts`, `package.json` (a `predev`/`prebuild` copy hook)

- [ ] **Step 1: Write the copy script**

`scripts/copy-sqlite3.mjs` — copies the two runtime files from the installed package dist into `public/sqlite3/`:
```js
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// sqlite3 is self-hosted (not bundled) so Turbopack never touches @sqlite.org/sqlite-wasm's
// sqlite3-worker1.mjs (which has an un-bundleable dynamic Worker). The worker loads these at runtime.
const pkg = dirname(fileURLToPath(import.meta.resolve('@sqlite.org/sqlite-wasm/package.json')));
const out = join(process.cwd(), 'public', 'sqlite3');
mkdirSync(out, { recursive: true });
for (const f of ['sqlite3.mjs', 'sqlite3.wasm']) {
  copyFileSync(join(pkg, 'dist', f), join(out, f));
}
console.log('copied sqlite3 dist -> public/sqlite3/');
```

- [ ] **Step 2: Verify the dist filenames**

Run: `ls node_modules/@sqlite.org/sqlite-wasm/dist/`
Expected: confirm `sqlite3.mjs` and `sqlite3.wasm` exist (per Plan 1 research they do). If the ESM build has a different name (e.g. `sqlite3-bundler-friendly.mjs`), use that name in the script and in the worker import below — the pair must be the plain OO1 build, NOT `sqlite3-worker1.mjs`.

- [ ] **Step 3: Wire the copy into npm scripts + run it**

In `package.json` add a `predev:web` and `prebuild:web` (and a standalone `copy:sqlite3`) that run `node scripts/copy-sqlite3.mjs`. Then run `node scripts/copy-sqlite3.mjs`.
Run: `ls public/sqlite3/`
Expected: `sqlite3.mjs` and `sqlite3.wasm` present. Add `public/sqlite3/` to `.gitignore` (generated artifact) OR commit it — lean: gitignore + the predev/prebuild hook regenerates it (note the choice in the commit).

- [ ] **Step 4: Change `worker.ts` to runtime-load sqlite3**

Replace the static `import sqlite3InitModule, { ... } from '@sqlite.org/sqlite-wasm'` with a **type-only** import plus a runtime dynamic import inside `boot()`:
```ts
import type { Sqlite3Static, Database, BindableValue } from '@sqlite.org/sqlite-wasm';

// Runtime-load the self-hosted sqlite3 (public/sqlite3/) so Turbopack never bundles the npm package
// (whose sqlite3-worker1.mjs has an un-resolvable dynamic Worker). turbopackIgnore leaves this import
// as a runtime URL fetch. locateFile points the loader at the .wasm sitting beside the .mjs.
async function boot(): Promise<void> {
  const { default: sqlite3InitModule } = await import(
    /* turbopackIgnore: true */ '/sqlite3/sqlite3.mjs'
  );
  api = await sqlite3InitModule({ locateFile: (file: string) => `/sqlite3/${file}` });
  const pool = await api.installOpfsSAHPoolVfs({ name: 'moniflow-pool' });
  db = new pool.OpfsSAHPoolDb(DB_FILE);
  for (const ddl of BOOTSTRAP_SQL) runStmt(ddl);
}
```
Everything else in `worker.ts` (message protocol, `queryRows`, `runStmt`, the `get`→`rows[0]` sentinel) is unchanged. The dynamic-import result is untyped (`unknown`) — type `sqlite3InitModule` via a local function type so no `any`/`as` is needed:
```ts
type Sqlite3Init = (opts?: { locateFile?: (file: string) => string }) => Promise<Sqlite3Static>;
```
and destructure `const mod: { default: Sqlite3Init } = await import(...)`. Adjust to whatever keeps it `any`/`as`-free while typechecking.

- [ ] **Step 5: Typecheck the worker**

Run: `npm run typecheck 2>&1` (check the saved log). Expected: ZERO errors in `src/db/worker.ts`. (Pages/actions errors remain — Plan 2b.) The runtime proof (sqlite3 actually loads, no `<dynamic>` resolve error) comes in Task 4 once the app compiles.

- [ ] **Step 6: Commit**
```bash
git add scripts/copy-sqlite3.mjs package.json .gitignore src/db/worker.ts
git commit -m "feat(db): self-host sqlite3 in /public; worker loads it via turbopackIgnore import" \
  -m "Sidesteps the Turbopack blocker: @sqlite.org/sqlite-wasm's index.mjs drags in sqlite3-worker1.mjs whose dynamic Worker can't be bundled. We use the SAHPool VFS and load the sqlite3 OO1 build from /public at runtime; npm package stays a type-only import."
```

---

## Task 2: Split `layout.tsx` — server layout + client `AppShell`

The root layout must stay a Server Component (it exports `metadata`/`viewport` and renders `<html>`), but it currently reads the DB via `initDb`. Move the DB-derived chrome (search suggestions + icon set) into a `'use client'` `AppShell` that loads them through a hook. This unblocks compilation of every route.

**Files:** Create `src/shared/ui/AppShell.tsx`, `src/features/entries/use-search-suggestions.ts` (+ `.test.ts`); Modify `src/app/layout.tsx`

**Interfaces produced:**
- `useSearchSuggestions(): { suggestions: string[]; iconSet: IconSet; ready: boolean }`
- `AppShell({ children }: { children: ReactNode })` — client shell.

- [ ] **Step 1: Write the hook**

`src/features/entries/use-search-suggestions.ts`:
```ts
'use client';
import { useEffect, useState } from 'react';
import { getBrowserDb } from '@db/browser';
import { getDistinctCategories, getDistinctAccounts } from './queries';
import { getIconSet, type IconSet } from '@features/settings/queries';

export function useSearchSuggestions(): { suggestions: string[]; iconSet: IconSet; ready: boolean } {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [iconSet, setIconSet] = useState<IconSet>('emoji');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void (async () => {
      const db = await getBrowserDb();
      const [cats, accts, icons] = await Promise.all([
        getDistinctCategories(db),
        getDistinctAccounts(db),
        getIconSet(db),
      ]);
      setSuggestions([...new Set([...cats, ...accts])].sort());
      setIconSet(icons);
      setReady(true);
    })();
  }, []);
  return { suggestions, iconSet, ready };
}
```

- [ ] **Step 2: Write a renderHook test**

`src/features/entries/use-search-suggestions.test.ts` — mock `@db/browser`'s `getBrowserDb` to return a `makeNodeProxyDb()` seeded with a couple categories/accounts; assert `ready` flips true and `suggestions` is the sorted de-duped union. (Use `@testing-library/react`'s `renderHook` + `waitFor`, matching existing hook tests in the repo — check an existing `use-*.test.ts` for the exact harness.)

- [ ] **Step 3: Run the test to verify it fails, then passes**

Run: `npm test -- src/features/entries/use-search-suggestions.test.ts` (FAIL → implement → PASS).

- [ ] **Step 4: Write `AppShell`**

`src/shared/ui/AppShell.tsx` — `'use client'`; calls `useSearchSuggestions()`; renders exactly the chrome the current layout renders inside `<body>` (the `CategoryPickerProvider iconSet=...`, `.app-frame` div, `AppHeader` with `SearchBox suggestions=...`, `main`, `BottomBar`, `ToastRegion`, `ServiceWorkerRegistrar`). While `!ready`, still render the frame (suggestions empty, iconSet default) so first paint isn't blank — the search pool just fills in a tick later.

- [ ] **Step 5: Slim `layout.tsx` to a server shell**

`layout.tsx` keeps: the `next/font` setup, `metadata`, `viewport`, `<html className=...><body>`. Remove: `import { initDb }`, all DB reads, `export const dynamic = 'force-dynamic'`. Body becomes `<AppShell>{children}</AppShell>`. Keep `import './globals.css'`.

- [ ] **Step 6: Verify compile + typecheck**

Run: `npm run typecheck 2>&1` — `layout.tsx`, `AppShell.tsx`, `use-search-suggestions.ts` have ZERO errors (remaining errors are the still-unconverted pages/actions — Plan 2b). Run `npm test` → all prior tests + the new hook test green.

- [ ] **Step 7: Commit**
```bash
git add src/app/layout.tsx src/shared/ui/AppShell.tsx src/features/entries/use-search-suggestions.ts src/features/entries/use-search-suggestions.test.ts
git commit -m "refactor(app): split root layout into server shell + client AppShell (browser-db chrome)"
```

---

## Task 3: Convert the home page to a client component + `use-home` hook

Port `page.tsx` from an async Server Component (reading `initDb`) to a `'use client'` component that loads its cycle data through a `use-home` hook and reads `cycle`/`view` from `useSearchParams`. The presentational JSX is unchanged; only the data source and the param source move.

**Files:** Create `src/features/entries/use-home.ts` (+ `.test.ts`); Rewrite `src/app/page.tsx`

**Interfaces produced:**
- `useHome(cycleKey: string | null): { ready: boolean; data: HomeData | null }` where `HomeData` bundles everything the page renders: `{ cutoff, activeKey, currentKey, canGoNext, isCurrentCycle, cycle, summary, categoryBreakdown, slices, total, emojiMap, hueMap, iconSet, limits, totalStatus, progress, pacePct }` — i.e. the exact set the current server component computes (lines 45–78 of the old page).

- [ ] **Step 1: Write `use-home`**

`src/features/entries/use-home.ts` — `'use client'`. Loads `getBrowserDb()`, then reproduces the current page's server computation **verbatim** but async: `await getCutoff`, derive `currentKey`/`activeKey` (from the passed `cycleKey`), `await getCycleSummary`, `await getCategoryBreakdown`, `await getBudgets`, `await getEmojiMap`/`getHueMap`/`getIconSet`; call the SAME pure helpers (`cycleFromKey`, `currentCycleKey`, `cycleProgress`, `toDonutSlices`, `toBudgetTotal`) — they are unchanged. Returns `{ ready, data }`. Re-runs when `cycleKey` changes (effect dep).

- [ ] **Step 2: renderHook test**

`use-home.test.ts` — `getBrowserDb` mocked to a seeded `makeNodeProxyDb()` (a few expense rows in a known cycle); assert `data.summary.count` and `data.slices` match the seed. FAIL → implement → PASS. Run: `npm test -- src/features/entries/use-home.test.ts`.

- [ ] **Step 3: Rewrite `page.tsx`**

- Add `'use client'`; remove `export const dynamic` and the `initDb`/`ensure*`/query imports (they move into the hook).
- Read params: `const params = useSearchParams(); const cycleParam = params.get('cycle'); const view = params.get('view') ?? undefined;`
- `const { ready, data } = useHome(cycleParam);`
- While `!ready || !data`, render a minimal loading state inside `<PageContainer size="full">` (e.g. the `CycleSelector` skeleton or a spinner — keep it calm; a bare `<PageContainer>` with a small "…" is acceptable for 2a).
- When ready, render the EXACT existing JSX (lines 80–207), sourcing every value from `data` instead of local consts. `ViewLink` stays as-is.
- The `<Link>` hrefs and `CycleSwipe`/`CycleSelector`/`Breakdown`/`DonutChart`/`CategoryEditTrigger` children are unchanged (already client-compatible).

- [ ] **Step 4: Typecheck + unit tests**

Run: `npm run typecheck 2>&1` — `page.tsx` + `use-home.ts` ZERO errors. `npm test` → all green.

- [ ] **Step 5: Commit**
```bash
git add src/app/page.tsx src/features/entries/use-home.ts src/features/entries/use-home.test.ts
git commit -m "refactor(app): home page loads cycle data client-side via use-home + getBrowserDb"
```

---

## Task 4: Live browser verification (the whole slice, via Playwright)

The first real proof that the worker + WASM + OPFS round-trip works in a browser. No automated harness exists for this; drive it once with Playwright and record the result.

**Files:** none committed (temporary verification only)

- [ ] **Step 1: Start the dev server**

Run `npm run dev:web` (background). Confirm "Ready". (predev copies sqlite3 into /public.)

- [ ] **Step 2: Load `/` on empty OPFS**

Navigate Playwright to `http://127.0.0.1:4010/`. Expected: **compiles with NO "Can't resolve <dynamic>" error** (proves Task 1), page renders the `EmptyLedger` state (empty OPFS → `summary.count === 0`), and the browser console has no errors. Capture console + a snapshot. If the sqlite3 `.wasm` fails to load, fix `locateFile`/the `/public` path (Task 1) and retry.

- [ ] **Step 3: Insert an entry and confirm it flows through**

Via Playwright `browser_evaluate`, run in the page context:
```js
async () => {
  const { getBrowserDb } = await import('/_next/... ');  // OR expose a tiny window.__seed helper in dev
  // simplest: navigate to a temp route or call the already-loaded module.
}
```
Practical approach: add a **temporary** dev-only `window.__moniSeed` in `AppShell` (guarded by `process.env.NODE_ENV !== 'production'`) that calls `getBrowserDb` + `insertEntry` with one expense in the current cycle; call it from Playwright, then reload `/`. Expected: the donut/summary now render with that entry (count 1, the category slice visible). Remove the temp helper before finishing.

- [ ] **Step 4: Confirm OPFS persistence**

Reload `/` again (no re-insert). Expected: the entry is STILL there (proves OPFS persisted across loads, not just in-memory). DevTools → Application → Storage shows OPFS usage.

- [ ] **Step 5: Record the result + clean up**

Remove the temp seed helper. Write the verification outcome (compiled ✓, empty render ✓, insert→render ✓, persist ✓, console clean) into the commit body.
```bash
git add -A
git commit -m "test(app): verified live OPFS/WASM round-trip on the home page (Plan 2a slice)"
```

---

## Self-Review

**Spec coverage:** bundling blocker resolved via self-host + `turbopackIgnore` (Task 1 ✓); shell split so metadata/viewport stay server while DB chrome goes client (Task 2 ✓); one page (home) converted to client `getBrowserDb` loading via a hook (Task 3 ✓); FIRST live browser verification of the worker/OPFS/WASM path (Task 4 ✓). Deferred to Plan 2b (10 pages, 5 actions, backup route, middleware delete, `output: 'export'`) — explicit in the scope boundary.

**Placeholder scan:** Task 4 Step 3's seed mechanism is described (temp dev helper) rather than pre-written because it depends on Task 1's exact module URLs; it is bounded (one insert, removed before commit), not open-ended. Task 3's JSX port references the exact source lines to copy rather than repeating 130 lines of unchanged markup.

**Type consistency:** `IconSet` from `@features/settings/queries` used in both hooks. `HomeData` (Task 3) is the exact field set the old server component computed. `getBrowserDb`/the async queries/pure helpers are all Plan-1 interfaces, unchanged. No `initDb` or `force-dynamic` remains in `layout.tsx` or `page.tsx` after Tasks 2–3.

**Open risk (flagged, not hidden):** Task 1 is the load-bearing spike — if `turbopackIgnore` + `/public` runtime import doesn't cleanly load sqlite3 (e.g. `locateFile` or MIME/type-module issues serving `.mjs` from `/public`), fall back to the `turbopack.resolveAlias` stub approach (spec option A) within Task 1 before proceeding. Task 4 is where this is proven; do not mark Plan 2a done until Step 2 compiles and renders in a real browser.

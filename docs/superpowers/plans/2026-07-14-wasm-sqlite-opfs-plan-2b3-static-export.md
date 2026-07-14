# WASM-SQLite/OPFS Migration — Plan 2b-3: Static Export + Full Verification + Merge

> **For agentic workers:** this is the FINAL plan of the migration. It is partly a **spike** — the `output: 'export'` flip surfaces static-export constraints that can't all be pre-specified; the build errors name what to fix. Drive `npm run build:web` iteratively.

**Goal:** Turn the (now fully client-rendered) app into a static-exported, installable, offline-first PWA: delete the server-only middleware, flip Next to `output: 'export'`, fix whatever static export demands, verify EVERY route live in a browser (plus a write-repaints-without-reload check), review the whole branch, and merge the migration.

**Depends on:** Plans 1, 2a, 2b, 2b-2 (all on `feat/wasm-sqlite-opfs-pwa`). Whole app typechecks clean; every page is a client component loading via OPFS; all writes are client writes + `bumpDataVersion`.

## Known static-export constraints to expect (the build will confirm which bite)

- **No server route handlers / middleware.** `src/middleware.ts` must go (delete it). The CSV route was already removed in 2b-2.
- **Dynamic route `entries/[id]/edit`** can't be statically exported per-id (ids are unknown at build). Fix: reshape to a **query-param route** — a static `/entries/edit` page reading `?id=` via `useSearchParams` — and update the links that point at `/entries/{id}/edit`. (Alternative considered + rejected: `generateStaticParams` can't enumerate runtime ids.)
- **`useSearchParams` requires a `<Suspense>` boundary** for static export, or the build errors. Wrap each page's search-params-reading client subtree in `<Suspense>` (a small fallback) — likely a shared helper.
- **PWA shell** (`manifest.webmanifest`, `sw.js`, icons) must remain served as static assets and register from the client (`ServiceWorkerRegistrar` already client-side).

## Global Constraints

- TS strict: no `any`/`as`(except `as const`)/`!`/ts-comments. `type` over `interface`. `for..of`.
- Verify the STATIC build (`npm run build:web`) AND the served `out/` in a real browser (not just `npm run dev:web`).
- Git Bash. Read the kuman-ctx SAVED LOG for real error counts (piped `grep -c` gives a false 0).
- Commit format `type(scope): subject` + body. Scope `app`/`shared`.

---

## Task 1: Delete middleware; flip to static export; surface the build errors

**Files:** Delete `src/middleware.ts`; Modify `next.config.ts`; maybe `package.json`.

- [ ] **Step 1:** `git rm src/middleware.ts`. (Static export has no server to run it; offline-first ships zero data to the host, so the Basic-auth gate is moot — noted in the spec.)
- [ ] **Step 2:** `next.config.ts` → add `output: 'export'`; drop `serverExternalPackages` (no server bundle now). Keep it minimal.
- [ ] **Step 3:** Run `npm run build:web` and **read every error**. Record the list — these are Tasks 2–3's actual work. Expected: `useSearchParams`-needs-Suspense on several pages, and the `entries/[id]/edit` dynamic-route-without-generateStaticParams error.
- [ ] **Step 4:** Commit `chore(app): delete middleware; next.config output: export` (config + deletion only; fixes follow).

---

## Task 2: Fix `useSearchParams` Suspense boundaries

**Files:** the pages the build flags (home, records, budgets, accounts, categories, trips, settings, entries/new — whichever read `useSearchParams`).

- [ ] **Step 1:** For each flagged page, wrap the part that calls `useSearchParams()` in `<Suspense fallback={…}>`. Cleanest: extract the page body into an inner component and have the route default export render `<Suspense fallback={<PageContainer …/>}><Inner/></Suspense>`. Consider a tiny shared `withSearchParamsSuspense` helper if the repetition is real.
- [ ] **Step 2:** Re-run `npm run build:web` until no Suspense errors remain.
- [ ] **Step 3:** Commit `fix(app): Suspense-wrap useSearchParams for static export`.

---

## Task 3: Reshape the dynamic edit route to a static query-param route

**Files:** Move `src/app/entries/[id]/edit/page.tsx` → `src/app/entries/edit/page.tsx`; update `use-edit-entry` id source; update links.

- [ ] **Step 1:** Create `src/app/entries/edit/page.tsx` reading `const id = Number(useSearchParams().get('id'))` instead of `useParams()`; otherwise identical to the converted edit page (loads via `useEditEntry(id)`, not-found handling, post-submit `push('/records')`). Wrap its `useSearchParams` in `<Suspense>` (Task 2 pattern).
- [ ] **Step 2:** `git rm -r src/app/entries/[id]`. Update every link that builds `/entries/${id}/edit` → `/entries/edit?id=${id}` (grep for the old pattern — likely in a records row / SwipeRow / entry list component).
- [ ] **Step 3:** `npm run build:web` → passes (a clean `out/` is produced). `npm test` + `npm run typecheck` still green.
- [ ] **Step 4:** Commit `refactor(entries): edit route becomes static /entries/edit?id= for static export`.

---

## Task 4: Full live browser verification of the static build

Serve the exported `out/` and drive every route in a real browser.

- [ ] **Step 1:** Serve `out/` on a local port (e.g. `npx serve out -l 4020`, or any static server). NOT `next dev` — verify the actual static export.
- [ ] **Step 2:** Via Playwright, for a fresh OPFS then a seeded one, visit **every route** — `/`, `/records`, `/budgets`, `/categories`, `/accounts`, `/trips`, `/settings`, `/entries/new`, `/entries/edit?id=…` — and confirm each: compiles/serves, renders (empty state, then with data), **no console errors**, worker/OPFS boots once.
- [ ] **Step 3:** **Write-repaints-without-reload check** (the refresh mechanism, never watched live): with data present, edit a category emoji/hue via the picker (or add an entry) and confirm the relevant surface updates WITHOUT a manual reload (proves `bumpDataVersion` → hook refetch).
- [ ] **Step 4:** Confirm the CSV export button downloads, and the PWA manifest/service worker register (installable). Record all results.
- [ ] **Step 5:** If anything fails, fix it (new commit) and re-verify. Do not proceed until every route is clean.

---

## Task 5: Whole-branch review + finish

- [ ] **Step 1:** Dispatch a whole-branch code review (superpowers:requesting-code-review) over the full `main..HEAD` migration diff (or at least the 2a/2b/2b-2/2b-3 range) on the most capable model — focus: no `initDb`/`force-dynamic`/`revalidatePath` residue, every read-hook wired to `useDataVersion`, no `any`/`as`/`!`, the static-export config, the OPFS worker/concurrency correctness.
- [ ] **Step 2:** Fix any Critical/Important findings (one fix pass), re-verify tests + build.
- [ ] **Step 3:** Use superpowers:finishing-a-development-branch to present the merge options to the user. **The merge itself is the user's decision** — do not merge without explicit consent. Summarize: the full migration (Plans 1 → 2b-3), what changed, how it was verified, and the recommended integration path.

## Self-Review

**Spec coverage:** middleware delete + `output: 'export'` (Task 1 ✓); the two known static-export blockers — Suspense (Task 2), dynamic route (Task 3) ✓; first full live verification of every route + the reactive-refresh visual proof + PWA (Task 4 ✓); whole-branch review + user merge decision (Task 5 ✓). This completes the migration.

**Spike honesty:** Tasks 1–3 are build-driven — the exact set of Suspense-wrapped pages and any un-foreseen static-export error come from `npm run build:web` output, not a guess. That's called out, not hidden. If the build surfaces a constraint not listed above, fix it and note it before proceeding.

**Type consistency:** the edit route keeps `useEditEntry(id)` — only the id SOURCE changes (`useParams` → `useSearchParams().get('id')`). All other hooks/pages unchanged.

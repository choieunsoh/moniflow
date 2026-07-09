# Monefy expense redesign — Phase 1 (Shell & expense focus) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the app into a mobile-only, expense-focused shell: a centered fixed-width phone-frame column (desktop = mobile), an always-on bottom bar with slots **Home · Records · [＋ expense FAB] · Budgets · More**, no desktop nav, and a **total-spent** hero on Home. Every tab routes to a working page.

**Architecture:** Reuses the v1 bottom-bar chassis and `isActivePath`. The whole app becomes one column capped by a `--app-max-width` token; `Nav.tsx` and all `sm:` dual-layout branches are deleted. Expense-only: the Home hero is total spent this cycle; the four-figure `SummaryBar` (net/inflow/outflow) is dropped. No new dependency. Spec: `docs/superpowers/specs/2026-07-09-monefy-expense-redesign-design.md`.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, TypeScript strict, Vitest.

**Conventions (CLAUDE.md):** no `any`/`as`/`!`/ts-comments; `type` over `interface`; `for..of`; extensionless relative imports; aliases `@db`/`@features`/`@shared`. Gates before every commit (run separately): `npm run format:files <changed>` → `npm run typecheck` → `npm run lint` → `npm run format:check` → `npm test`. Commit with repeated `-m` flags (never `-F`/heredoc). Subagents: **Git Bash (POSIX)**, not PowerShell.

---

## File Structure

| File | Change |
|---|---|
| `src/app/globals.css` | add `--app-max-width` token |
| `src/app/layout.tsx` | center the app in the width-token column; drop footer; always-on bottom padding |
| `src/shared/ui/AppHeader.tsx` | drop `<Nav/>`; constrain to the column |
| `src/shared/ui/Nav.tsx` | **delete** |
| `src/shared/ui/AppFooter.tsx` | **delete** (About already lives in the More sheet) |
| `src/shared/ui/BottomBar.tsx` | always-on, column-centered, `Records` slot, expense FAB |
| `src/shared/ui/MoreSheet.tsx` | add `Trips` link |
| `src/app/page.tsx` | total-spent hero; drop SummaryBar + recent list + header Add button |
| `src/app/records/page.tsx` | **new** — cycle nav + full-cycle `LedgerTable` |

---

## Task 1: App-width token + mobile-frame layout

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Add the width token to globals.css**

In `src/app/globals.css`, inside the `:root { … }` block (the non-`@theme` vars, where `--z-header` etc. live), add this line just after `color-scheme: dark;`:

```css
  /* Mobile-only app frame. On the phone the column is edge-to-edge (screen <= this); on desktop it's
     a centered fixed-width phone frame. Target: Samsung Galaxy S24 Ultra (~384–412px CSS width). */
  --app-max-width: 412px;
```

- [ ] **Step 2: Rewrite the layout body to a centered column**

In `src/app/layout.tsx`: remove the `AppFooter` import (line 6). Replace the entire `<body>…</body>` block with:

```tsx
      <body className="min-h-dvh">
        {/* The whole app is a centered fixed-width phone frame (mobile-only; desktop = same size). */}
        <div className="mx-auto flex min-h-dvh w-full max-w-[var(--app-max-width)] flex-col">
          <AppHeader />
          {/* pb clears the fixed bottom bar (bar height + FAB overhang + safe area). */}
          <main className="flex-1 pb-24">{children}</main>
        </div>
        <BottomBar />
      </body>
```

- [ ] **Step 3: Gates + commit**

```bash
npm run format:files src/app/globals.css src/app/layout.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat(app): center the app in a fixed-width mobile frame" -m "Adds the --app-max-width token (default 412px, tuned to the S24 Ultra) and wraps the app in one centered column. Desktop renders at the same phone width; mobile is edge-to-edge. Drops the footer from the layout (About lives in the More sheet)."
```

---

## Task 2: Drop the desktop Nav and footer

**Files:**
- Modify: `src/shared/ui/AppHeader.tsx`
- Delete: `src/shared/ui/Nav.tsx`
- Delete: `src/shared/ui/AppFooter.tsx`

- [ ] **Step 1: Replace `src/shared/ui/AppHeader.tsx` entirely**

```tsx
import Link from 'next/link';
import { Wordmark } from './Wordmark';

// Mobile app header: just the wordmark (nav now lives in the bottom bar). Sticky, blurred, and
// constrained to the app column by its parent in layout.tsx.
export function AppHeader() {
  return (
    <header
      className="sticky top-0 border-b backdrop-blur-md"
      style={{
        zIndex: 'var(--z-header)',
        background: 'color-mix(in oklab, var(--color-bg) 82%, transparent)',
        borderColor: 'var(--color-border)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div className="flex h-14 items-center px-4">
        <Link href="/" className="tap rounded-[var(--radius-sm)]" aria-label="moniflow home">
          <Wordmark />
        </Link>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Delete the now-unused components**

```bash
git rm src/shared/ui/Nav.tsx src/shared/ui/AppFooter.tsx
```

- [ ] **Step 3: Confirm no stragglers**

Run: `git grep -nE "AppFooter|from './Nav'|ui/Nav" -- src` — expect NO matches (AppHeader was the only importer of Nav; layout dropped AppFooter in Task 1). If any remain, remove them.

- [ ] **Step 4: Gates + commit**

```bash
npm run format:files src/shared/ui/AppHeader.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/shared/ui/AppHeader.tsx src/shared/ui/Nav.tsx src/shared/ui/AppFooter.tsx
git commit -m "refactor(shared): drop desktop Nav and footer for the mobile shell" -m "The bottom bar owns navigation now, so the top Nav and the footer are removed. AppHeader collapses to just the wordmark."
```

---

## Task 3: Retune the BottomBar (always-on, Records slot, expense FAB)

**Files:**
- Modify: `src/shared/ui/BottomBar.tsx`

- [ ] **Step 1: Replace `src/shared/ui/BottomBar.tsx` entirely**

```tsx
'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { isActivePath } from './active-path';
import { MoreSheet } from './MoreSheet';

// App-style tab bar, always visible, centered to the app column. Five slots:
// Home · Records · [＋ expense FAB → /entries/new] · Budgets · More. Expense-only: the center FAB is
// the single "add expense" action. z-index matches the header; the More sheet is top-layer above it.
export function BottomBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed bottom-0 left-1/2 w-full max-w-[var(--app-max-width)] -translate-x-1/2 border-t backdrop-blur-md"
        style={{
          zIndex: 'var(--z-header)',
          background: 'color-mix(in oklab, var(--color-bg) 82%, transparent)',
          borderColor: 'var(--color-border)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <ul className="grid grid-cols-5 items-end">
          <BarLink href="/" label="Home" active={isActivePath(pathname, '/')} icon={<HomeIcon />} />
          <BarLink
            href="/records"
            label="Records"
            active={isActivePath(pathname, '/records')}
            icon={<RecordsIcon />}
          />
          <li className="flex justify-center">
            <Link
              href="/entries/new"
              aria-label="Add expense"
              className="-mt-5 grid size-14 place-items-center rounded-full shadow-[var(--shadow-2)]"
              style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
            >
              <PlusIcon />
            </Link>
          </li>
          <BarLink
            href="/budgets"
            label="Budgets"
            active={isActivePath(pathname, '/budgets')}
            icon={<BudgetsIcon />}
          />
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className="flex min-h-[44px] w-full flex-col items-center justify-center gap-1 py-2"
              style={{ color: 'var(--color-muted)' }}
            >
              <MoreIcon />
              <span className="text-[0.625rem] font-medium">More</span>
            </button>
          </li>
        </ul>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}

function BarLink({
  href,
  label,
  active,
  icon,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className="flex min-h-[44px] w-full flex-col items-center justify-center gap-1 py-2"
        style={{ color: active ? 'var(--color-accent-text)' : 'var(--color-muted)' }}
      >
        {icon}
        <span className="text-[0.625rem] font-medium">{label}</span>
      </Link>
    </li>
  );
}

// Inline SVG icons (stroke=currentColor so each inherits its slot's active/muted color). No icon dep.
function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2 7 8 2l6 5v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RecordsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 2.5h10v11l-2-1.2-1.5 1.2L8 12.3 6.5 13.5 5 12.3 3 13.5z M5.5 5.5h5 M5.5 8h5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BudgetsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 5.5h11v7h-11z M2.5 5.5 8 2l5.5 3.5 M10.5 9h1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 3h3.5v3.5H3z M9.5 3H13v3.5H9.5z M3 9.5h3.5V13H3z M9.5 9.5H13V13H9.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 3v10 M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
```

- [ ] **Step 2: Gates + commit**

```bash
npm run format:files src/shared/ui/BottomBar.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/shared/ui/BottomBar.tsx
git commit -m "feat(shared): always-on bottom bar with Records slot and expense FAB" -m "Bar is no longer sm:hidden and is centered to the app column. Slots are Home/Records/Budgets/More around a single center expense FAB (Add expense -> /entries/new). Trips moves to the More sheet; Records icon added."
```

---

## Task 4: Add Trips to the More sheet

**Files:**
- Modify: `src/shared/ui/MoreSheet.tsx`

- [ ] **Step 1: Update the `LINKS` array** in `src/shared/ui/MoreSheet.tsx`. Replace:

```tsx
const LINKS = [
  { href: '/categories', label: 'Categories' },
  { href: '/settings', label: 'Settings' },
] as const;
```

with:

```tsx
const LINKS = [
  { href: '/categories', label: 'Categories' },
  { href: '/trips', label: 'Trips' },
  { href: '/settings', label: 'Settings' },
] as const;
```

- [ ] **Step 2: Gates + commit**

```bash
npm run format:files src/shared/ui/MoreSheet.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/shared/ui/MoreSheet.tsx
git commit -m "feat(shared): add Trips to the More sheet" -m "Trips left the bottom bar (Records took its slot), so it joins Categories and Settings in the More sheet."
```

---

## Task 5: Home — total-spent hero, expense-only

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace `src/app/page.tsx` entirely**

```tsx
// Reads the local SQLite DB per request (better-sqlite3 can't be prerendered, and the ledger is
// live data), so opt out of static generation.
export const dynamic = 'force-dynamic';

import { PageContainer } from '@shared/ui/PageContainer';
import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getCycleSummary, getCategoryBreakdown } from '@features/entries/queries';
import { cycleFromKey, currentCycleKey } from '@features/entries/cycle';
import { ensureSettingsTable } from '@features/settings/schema';
import { getCutoff } from '@features/settings/queries';
import { todayIso } from '@shared/date';
import { formatBaht } from '@shared/money';
import { Breakdown } from '@features/entries/ui/Breakdown';
import { CycleSelector } from '@features/entries/ui/CycleSelector';
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';

// Home = the expense overview for the current cycle: a total-spent hero, cycle nav, and the top
// spending categories. Expense-only — no net/inflow figures. The donut + view toggle land in phase 2.
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { cycle: cycleParam } = await searchParams;
  const db = initDb();
  ensureEntriesTable(db);
  ensureSettingsTable(db);

  const cutoff = getCutoff(db);
  const activeKey = cycleParam ?? currentCycleKey(todayIso(), cutoff);
  const cycle = cycleFromKey(activeKey, cutoff);
  const summary = getCycleSummary(db, cycle.start, cycle.end);
  const categoryBreakdown = getCategoryBreakdown(db, cycle.start, cycle.end);
  const spent = Math.abs(summary.outflow);

  return (
    <PageContainer size="full">
      <CycleSelector activeKey={activeKey} cutoff={cutoff} />

      {summary.count > 0 ? (
        <>
          <section className="panel flex flex-col items-center gap-1 px-6 py-8 text-center">
            <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
              Spent this cycle
            </span>
            <span className="tnum text-4xl font-semibold" style={{ color: 'var(--color-loss)' }}>
              {formatBaht(spent)}
            </span>
            <span className="tnum text-sm" style={{ color: 'var(--color-faint)' }}>
              {new Intl.NumberFormat('en-US').format(summary.count)} entries
            </span>
          </section>
          <Breakdown title="Top categories" rows={categoryBreakdown.slice(0, 8)} />
        </>
      ) : (
        <EmptyLedger />
      )}
    </PageContainer>
  );
}
```

- [ ] **Step 2: Gates + commit**

```bash
npm run format:files src/app/page.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/app/page.tsx
git commit -m "feat(app): expense-only Home with total-spent hero" -m "Drops the four-figure SummaryBar (net/inflow/outflow) and the recent-entries list (now the Records tab). Home shows a total-spent hero, cycle nav, and the top spending categories. The header Add button is gone — the bottom-bar FAB is always present."
```

---

## Task 6: Records route

**Files:**
- Create: `src/app/records/page.tsx`

- [ ] **Step 1: Create `src/app/records/page.tsx`**

```tsx
export const dynamic = 'force-dynamic';

import { PageContainer } from '@shared/ui/PageContainer';
import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getEntriesInRange } from '@features/entries/queries';
import { cycleFromKey, currentCycleKey } from '@features/entries/cycle';
import { ensureSettingsTable } from '@features/settings/schema';
import { getCutoff } from '@features/settings/queries';
import { todayIso } from '@shared/date';
import { CycleSelector } from '@features/entries/ui/CycleSelector';
import { LedgerTable } from '@features/entries/ui/LedgerTable';
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';

// Records = the full chronological log for the cycle (newest first). Phase 2 upgrades this to
// grouped-by-day with notes-first rows; for now it reuses LedgerTable over the whole cycle.
export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { cycle: cycleParam } = await searchParams;
  const db = initDb();
  ensureEntriesTable(db);
  ensureSettingsTable(db);

  const cutoff = getCutoff(db);
  const activeKey = cycleParam ?? currentCycleKey(todayIso(), cutoff);
  const cycle = cycleFromKey(activeKey, cutoff);
  const entries = getEntriesInRange(db, cycle.start, cycle.end);

  return (
    <PageContainer size="full">
      <CycleSelector activeKey={activeKey} cutoff={cutoff} />
      {entries.length > 0 ? (
        <LedgerTable entries={[...entries].reverse()} />
      ) : (
        <EmptyLedger />
      )}
    </PageContainer>
  );
}
```

- [ ] **Step 2: Gates + commit**

```bash
npm run format:files src/app/records/page.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/app/records/page.tsx
git commit -m "feat(app): add Records route with the full cycle log" -m "The Records tab lists every entry in the cycle newest-first (reusing LedgerTable) with cycle nav. Grouped-by-day + notes-first comes in phase 2."
```

---

## Task 7: Phase 1 verification (build + S24 Ultra smoke)

**Files:** none (verification only)

- [ ] **Step 1: Full gate sweep + production build**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
npm run build:web
```
Expected: all PASS; build lists routes including `/` and `/records`.

- [ ] **Step 2: Browser smoke at S24 Ultra width**

Start `npm run dev:web` (127.0.0.1:4010). With Playwright at 384–412px width, verify:
  - App is a centered fixed-width column; on a wide window the sides are empty (desktop = phone size).
  - Bottom bar is always visible: **Home · Records · ＋ · Budgets · More**; center ＋ is raised/larger; no top nav; no footer; content clears the bar.
  - Home: total-spent hero (red), cycle nav, top categories. `/records`: full cycle list. Budgets/Trips/Categories/Settings reachable (Trips/Categories/Settings via More).
  - Tapping ＋ → `/entries/new`.

- [ ] **Step 3: Tune `--app-max-width` to the real S24 Ultra**

Have the user load `http://<LAN-IP>:4010` on their S24 Ultra (rebind dev server to `0.0.0.0` if needed) and report — or read via a temporary `document.documentElement.clientWidth` check — the phone's CSS width. Set `--app-max-width` in `globals.css` to that value so desktop mirrors the device. Commit if changed:

```bash
git add src/app/globals.css
git commit -m "fix(app): set app width to the S24 Ultra CSS viewport"
```

- [ ] **Step 4: Confirm complete** via `superpowers:verification-before-completion`, then proceed to the Phase 2 plan.

---

## Self-Review

**Spec coverage (Phase 1 section):**
- Fixed-width column via `--app-max-width`, desktop = mobile → Task 1. ✅
- Drop `Nav.tsx` + desktop/footer → Task 2. ✅
- Bottom bar always-on, column-centered, Home·Records·＋·Budgets·More, expense FAB → Task 3. ✅
- More sheet adds Trips → Task 4. ✅
- Home total-spent hero, drop SummaryBar/recent/Add button → Task 5. ✅
- Records route → Task 6. ✅
- S24 Ultra width tuned on-device → Task 7. ✅

**Placeholder scan:** none — every code step is complete and runnable. ✅

**Type consistency:** `isActivePath(pathname, href)` and `MoreSheet { open, onClose }` unchanged from v1. Query names (`getCycleSummary`, `getCategoryBreakdown`, `getEntriesInRange`, `getCutoff`, `currentCycleKey`, `cycleFromKey`, `todayIso`, `formatBaht`) match verified exports. `Breakdown`/`CycleSelector`/`LedgerTable`/`EmptyLedger` props match their definitions. `summary.outflow`/`summary.count` match the `Summary` type. ✅
